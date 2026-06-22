import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthStore } from "@/lib/auth-store";
import { getProjectStore } from "@/lib/project-store";
import { clearSession, getCurrentUser } from "@/lib/session";
import { deleteAccountAction } from "./actions";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
}));

vi.mock("@/lib/auth-store", () => ({
  getAuthStore: vi.fn(),
}));

vi.mock("@/lib/project-store", () => ({
  getProjectStore: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  clearSession: vi.fn(),
  createSession: vi.fn(),
  getCurrentUser: vi.fn(),
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

describe("account actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(getProjectStore).mockReturnValue({
      listProjects: vi.fn(),
      getProject: vi.fn(),
      createProject: vi.fn(),
      updateProject: vi.fn(),
      deleteProject: vi.fn(),
      deleteProjectsForOwner: vi.fn(),
      rotateManagerAccessToken: vi.fn(),
      recordGitHubIssueSync: vi.fn(),
      startManagerCycle: vi.fn(),
      recordManagerReport: vi.fn(),
      markStaleManagerCyclesForProject: vi.fn(),
      markStaleManagerCyclesForOwner: vi.fn(),
    });
    vi.mocked(getAuthStore).mockReturnValue({
      findUserByNormalizedEmail: vi.fn(),
      createUser: vi.fn(),
      deleteUser: vi.fn(),
      createSession: vi.fn(),
      findSessionByTokenHash: vi.fn(),
      deleteSessionByTokenHash: vi.fn(),
      getGitHubConnection: vi.fn(),
      upsertGitHubConnection: vi.fn(),
      deleteGitHubConnection: vi.fn(),
    });
  });

  it("deletes the current account, projects, and session", async () => {
    await expect(deleteAccountAction()).rejects.toThrow("redirect:/");

    expect(getProjectStore().deleteProjectsForOwner).toHaveBeenCalledWith("user-1");
    expect(getAuthStore().deleteUser).toHaveBeenCalledWith("user-1");
    expect(clearSession).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("requires a signed-in user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    await expect(deleteAccountAction()).rejects.toThrow("redirect:/sign-in");

    expect(getProjectStore().deleteProjectsForOwner).not.toHaveBeenCalled();
    expect(getAuthStore().deleteUser).not.toHaveBeenCalled();
  });
});
