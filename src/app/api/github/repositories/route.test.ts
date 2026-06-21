import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthStore } from "@/lib/auth-store";
import { fetchGitHubRepositories } from "@/lib/github";
import { getCurrentUser } from "@/lib/session";
import { GET } from "./route";

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth-store", () => ({
  getAuthStore: vi.fn(),
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

describe("GET /api/github/repositories", () => {
  beforeEach(() => {
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
    vi.mocked(fetchGitHubRepositories).mockResolvedValue([repository]);
  });

  it("requires a BatonFlow session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Sign in is required.");
    expect(fetchGitHubRepositories).not.toHaveBeenCalled();
  });

  it("requires a connected GitHub account", async () => {
    vi.mocked(getAuthStore().getGitHubConnection).mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("Connect GitHub before listing repositories.");
    expect(fetchGitHubRepositories).not.toHaveBeenCalled();
  });

  it("returns repositories from the connected GitHub account without returning the token", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchGitHubRepositories).toHaveBeenCalledWith("github-secret");
    expect(body.repositories).toEqual([repository]);
    expect(JSON.stringify(body)).not.toContain("github-secret");
  });

  it("returns a gateway error when GitHub cannot list repositories", async () => {
    vi.mocked(fetchGitHubRepositories).mockRejectedValue(new Error("GitHub repository lookup failed with 403."));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe("GitHub repository lookup failed with 403.");
  });
});
