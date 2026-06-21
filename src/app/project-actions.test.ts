import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthStore } from "@/lib/auth-store";
import { fetchGitHubRepositories } from "@/lib/github";
import { getProjectStore } from "@/lib/project-store";
import { getCurrentUser } from "@/lib/session";
import {
  createWorkflowProjectAction,
  updateWorkflowProjectAction,
} from "./project-actions";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth-store", () => ({
  getAuthStore: vi.fn(),
}));

vi.mock("@/lib/project-store", () => ({
  getProjectStore: vi.fn(),
}));

vi.mock("@/lib/github", () => ({
  fetchGitHubRepositories: vi.fn(),
}));

const user = {
  id: "user-1",
  email: "jon@example.com",
  normalizedEmail: "jon@example.com",
  passwordHash: null,
  emailVerificationStatus: "verified" as const,
  phoneNumber: null,
  displayName: "Jon",
  planType: "free" as const,
  createdAt: "2026-06-21T00:00:00.000Z",
  lastUpdated: "2026-06-21T00:00:00.000Z",
};

const connection = {
  userId: "user-1",
  githubUserId: 123,
  login: "jonhickman5",
  name: "Jon",
  avatarUrl: null,
  accessToken: "github-secret",
  tokenType: "bearer",
  scope: "repo read:user user:email",
  connectedAt: "2026-06-21T00:00:00.000Z",
  lastUpdated: "2026-06-21T00:00:00.000Z",
};

const repository = {
  id: 456,
  owner: "jonhickman5",
  name: "BatonFlow",
  fullName: "jonhickman5/BatonFlow",
  url: "https://github.com/jonhickman5/BatonFlow",
  private: true,
  defaultBranch: "main",
  updatedAt: "2026-06-21T00:00:00.000Z",
  permissions: {
    admin: true,
    maintain: true,
    push: true,
    triage: true,
    pull: true,
  },
};

const workflowConfig = JSON.stringify({
  globalInstructionsMarkdown: "# Global\n\nKeep work focused.",
  stages: [
    {
      id: "planning",
      name: "Planning",
      priority: 1,
      instructionsMarkdown: "# Planning\n\nCreate issues.",
      input: null,
      output: {
        kind: "github_issue",
        status: "Open",
        label: "Pending Architecture",
        refillWhenAtOrBelow: 0,
        holdWhenAtOrAbove: 3,
      },
    },
  ],
});

function formData(entries: Record<string, string>) {
  const form = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    form.set(key, value);
  }

  return form;
}

function projectFormData(entries: Record<string, string> = {}) {
  return formData({
    title: "BatonFlow",
    objective: "Coordinate AI project work.",
    workflowConfig,
    maxTaskSteps: "20",
    staleAgentMinutes: "90",
    ...entries,
  });
}

describe("project actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(getAuthStore).mockReturnValue({
      findUserByNormalizedEmail: vi.fn(),
      createUser: vi.fn(),
      createSession: vi.fn(),
      findSessionByTokenHash: vi.fn(),
      deleteSessionByTokenHash: vi.fn(),
      getGitHubConnection: vi.fn().mockResolvedValue(connection),
      upsertGitHubConnection: vi.fn(),
      deleteGitHubConnection: vi.fn(),
    });
    vi.mocked(getProjectStore).mockReturnValue({
      listProjects: vi.fn(),
      getProject: vi.fn(),
      createProject: vi.fn().mockResolvedValue({ id: "project-1" }),
      updateProject: vi.fn().mockResolvedValue({ id: "project-1" }),
      rotateManagerAccessToken: vi.fn(),
      recordGitHubIssueSync: vi.fn(),
      startManagerCycle: vi.fn(),
      recordManagerReport: vi.fn(),
      markStaleManagerCyclesForProject: vi.fn(),
      markStaleManagerCyclesForOwner: vi.fn(),
    });
    vi.mocked(fetchGitHubRepositories).mockResolvedValue([repository]);
  });

  it("requires a BatonFlow session before creating projects", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    await expect(createWorkflowProjectAction({}, projectFormData())).rejects.toThrow("redirect:/sign-in");

    expect(redirect).toHaveBeenCalledWith("/sign-in");
    expect(getProjectStore().createProject).not.toHaveBeenCalled();
  });

  it("creates a project with a repository selected from the connected GitHub account", async () => {
    const result = await createWorkflowProjectAction(
      {},
      projectFormData({
        repositoryFullName: "jonhickman5/BatonFlow",
        repositoryAccessToken: "submitted-token-should-be-ignored",
      }),
    );

    const createInput = vi.mocked(getProjectStore().createProject).mock.calls[0][0];

    expect(result).toEqual({ message: "Project created." });
    expect(fetchGitHubRepositories).toHaveBeenCalledWith("github-secret");
    expect(createInput.repository).toEqual({
      githubRepositoryId: 456,
      owner: "jonhickman5",
      name: "BatonFlow",
      fullName: "jonhickman5/BatonFlow",
      url: "https://github.com/jonhickman5/BatonFlow",
      defaultBranch: "main",
    });
    expect(JSON.stringify(createInput)).not.toContain("submitted-token-should-be-ignored");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("blocks repository attachment when the user has not connected GitHub", async () => {
    vi.mocked(getAuthStore().getGitHubConnection).mockResolvedValue(null);

    const result = await createWorkflowProjectAction(
      {},
      projectFormData({ repositoryFullName: "jonhickman5/BatonFlow" }),
    );

    expect(result).toEqual({ error: "Connect your GitHub account before attaching a repository." });
    expect(getProjectStore().createProject).not.toHaveBeenCalled();
  });

  it("rejects repository names outside the connected account's repository list", async () => {
    const result = await createWorkflowProjectAction(
      {},
      projectFormData({ repositoryFullName: "somebody/else" }),
    );

    expect(result).toEqual({ error: "Select a repository from your connected GitHub account." });
    expect(getProjectStore().createProject).not.toHaveBeenCalled();
  });

  it("preserves an existing repository when the edit form has no repository picker value", async () => {
    const result = await updateWorkflowProjectAction(
      {},
      projectFormData({ projectId: "project-1", title: "Updated BatonFlow" }),
    );

    const updateInput = vi.mocked(getProjectStore().updateProject).mock.calls[0][0];

    expect(result).toEqual({ message: "Project saved." });
    expect(updateInput.repository).toBeUndefined();
    expect(fetchGitHubRepositories).not.toHaveBeenCalled();
  });

  it("detaches a repository when the user selects no repository", async () => {
    const result = await updateWorkflowProjectAction(
      {},
      projectFormData({ projectId: "project-1", repositoryFullName: "" }),
    );

    const updateInput = vi.mocked(getProjectStore().updateProject).mock.calls[0][0];

    expect(result).toEqual({ message: "Project saved." });
    expect(updateInput.repository).toBeNull();
    expect(fetchGitHubRepositories).not.toHaveBeenCalled();
  });
});
