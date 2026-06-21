import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthStore } from "@/lib/auth-store";
import {
  exchangeGitHubOAuthCode,
  fetchAuthenticatedGitHubUser,
  getGitHubOAuthConfig,
} from "@/lib/github";
import { getCurrentUser } from "@/lib/session";
import { GITHUB_OAUTH_STATE_COOKIE } from "@/app/api/github/connect/route";
import { GET } from "./route";

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth-store", () => ({
  getAuthStore: vi.fn(),
}));

vi.mock("@/lib/github", () => ({
  buildGitHubAuthorizeUrl: vi.fn(),
  exchangeGitHubOAuthCode: vi.fn(),
  fetchAuthenticatedGitHubUser: vi.fn(),
  getGitHubOAuthConfig: vi.fn(),
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

function request(url = "http://localhost/api/github/callback?code=oauth-code&state=oauth-state") {
  return new NextRequest(url, {
    headers: {
      cookie: `${GITHUB_OAUTH_STATE_COOKIE}=oauth-state`,
    },
  });
}

describe("GET /api/github/callback", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(getAuthStore).mockReturnValue({
      findUserByNormalizedEmail: vi.fn(),
      createUser: vi.fn(),
      createSession: vi.fn(),
      findSessionByTokenHash: vi.fn(),
      deleteSessionByTokenHash: vi.fn(),
      getGitHubConnection: vi.fn(),
      upsertGitHubConnection: vi.fn(),
      deleteGitHubConnection: vi.fn(),
    });
    vi.mocked(getGitHubOAuthConfig).mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost/api/github/callback",
    });
    vi.mocked(exchangeGitHubOAuthCode).mockResolvedValue({
      accessToken: "github-secret",
      tokenType: "bearer",
      scope: "repo read:user user:email",
    });
    vi.mocked(fetchAuthenticatedGitHubUser).mockResolvedValue({
      id: 123,
      login: "jonhickman5",
      name: "Jon Hickman",
      avatarUrl: "https://avatars.githubusercontent.com/u/123",
    });
  });

  it("requires a BatonFlow session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/sign-in");
  });

  it("rejects invalid OAuth state and clears the state cookie", async () => {
    const response = await GET(request("http://localhost/api/github/callback?code=oauth-code&state=wrong"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/?github=invalid_state");
    expect(response.headers.get("set-cookie")).toContain(`${GITHUB_OAUTH_STATE_COOKIE}=`);
    expect(exchangeGitHubOAuthCode).not.toHaveBeenCalled();
  });

  it("stores a connected GitHub account without exposing the token in redirects", async () => {
    const store = getAuthStore();
    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/?github=connected");
    expect(response.headers.get("location")).not.toContain("github-secret");
    expect(store.upsertGitHubConnection).toHaveBeenCalledWith({
      userId: "user-1",
      githubUserId: 123,
      login: "jonhickman5",
      name: "Jon Hickman",
      avatarUrl: "https://avatars.githubusercontent.com/u/123",
      accessToken: "github-secret",
      tokenType: "bearer",
      scope: "repo read:user user:email",
    });
  });

  it("redirects to a safe failure state when GitHub rejects the code", async () => {
    vi.mocked(exchangeGitHubOAuthCode).mockRejectedValue(new Error("bad verifier"));

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/?github=connect_failed");
    expect(getAuthStore().upsertGitHubConnection).not.toHaveBeenCalled();
  });
});
