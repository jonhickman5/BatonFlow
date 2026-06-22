import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGitHubAuthorizeUrl,
  exchangeGitHubOAuthCode,
  fetchAuthenticatedGitHubUser,
  fetchGitHubIssues,
  fetchGitHubRepositories,
  getGitHubOAuthConfig,
} from "@/lib/github";
import type { GitHubRepositoryConfig } from "@/lib/data-structures";

const repository: GitHubRepositoryConfig = {
  provider: "github",
  owner: "jonhickman5",
  name: "BatonFlow",
  url: "https://github.com/jonhickman5/BatonFlow",
  defaultBranch: "main",
  accessToken: "github-token",
  connectedAt: "2026-06-21T00:00:00.000Z",
  lastSyncedAt: null,
  syncError: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GITHUB_CLIENT_ID;
  delete process.env.GITHUB_CLIENT_SECRET;
  delete process.env.GITHUB_REDIRECT_URI;
});

describe("GitHub OAuth helpers", () => {
  it("builds OAuth config and authorize URLs", () => {
    process.env.GITHUB_CLIENT_ID = "client-id";
    process.env.GITHUB_CLIENT_SECRET = "client-secret";

    const config = getGitHubOAuthConfig("http://localhost:3000")!;
    const url = new URL(buildGitHubAuthorizeUrl(config, "state-value"));

    expect(config.redirectUri).toBe("http://localhost:3000/api/github/callback");
    expect(url.origin).toBe("https://github.com");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("scope")).toContain("repo");

    process.env.GITHUB_REDIRECT_URI = "https://batonflow.example/github/callback";
    expect(getGitHubOAuthConfig("http://localhost:3000")?.redirectUri).toBe(
      "https://batonflow.example/github/callback",
    );

    delete process.env.GITHUB_CLIENT_SECRET;
    expect(getGitHubOAuthConfig("http://localhost:3000")).toBeNull();
  });

  it("exchanges OAuth codes and reports exchange failures", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: "github-token",
        token_type: "bearer",
        scope: "repo",
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      exchangeGitHubOAuthCode("code", {
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUri: "http://localhost:3000/api/github/callback",
      }),
    ).resolves.toEqual({
      accessToken: "github-token",
      tokenType: "bearer",
      scope: "repo",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://github.com/login/oauth/access_token",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"code":"code"'),
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          error: "bad_verification_code",
          error_description: "The code passed is incorrect.",
        }),
      }),
    );
    await expect(
      exchangeGitHubOAuthCode("bad", {
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUri: "http://localhost:3000/api/github/callback",
      }),
    ).rejects.toThrow("The code passed is incorrect.");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
      }),
    );
    await expect(
      exchangeGitHubOAuthCode("bad", {
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUri: "http://localhost:3000/api/github/callback",
      }),
    ).rejects.toThrow("GitHub OAuth token exchange failed with 502");
  });

  it("fetches the authenticated GitHub user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: 123,
          login: "jonhickman5",
          name: "Jon",
          avatar_url: "https://avatars.githubusercontent.com/u/123",
        }),
      }),
    );

    await expect(fetchAuthenticatedGitHubUser("github-token")).resolves.toEqual({
      id: 123,
      login: "jonhickman5",
      name: "Jon",
      avatarUrl: "https://avatars.githubusercontent.com/u/123",
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(fetchAuthenticatedGitHubUser("bad-token")).rejects.toThrow(
      "GitHub user lookup failed with 401",
    );
  });

  it("fetches repositories with pagination and normalizes permissions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          link: '<https://api.github.com/user/repos?page=2>; rel="next"',
        }),
        json: vi.fn().mockResolvedValue([
          {
            id: 1,
            name: "BatonFlow",
            full_name: "jonhickman5/BatonFlow",
            html_url: "https://github.com/jonhickman5/BatonFlow",
            private: true,
            default_branch: "main",
            updated_at: "2026-06-21T00:00:00.000Z",
            owner: { login: "jonhickman5" },
            permissions: { admin: true, push: true, pull: true },
          },
        ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue([
          {
            id: 2,
            name: "GameGlass",
            full_name: "jonhickman5/GameGlass",
            html_url: "https://github.com/jonhickman5/GameGlass",
            private: false,
            default_branch: "trunk",
            updated_at: "2026-06-21T00:10:00.000Z",
            owner: { login: "jonhickman5" },
          },
        ]),
      });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchGitHubRepositories("github-token")).resolves.toMatchObject([
      {
        id: 1,
        fullName: "jonhickman5/BatonFlow",
        permissions: {
          admin: true,
          maintain: false,
          push: true,
          triage: false,
          pull: true,
        },
      },
      {
        id: 2,
        fullName: "jonhickman5/GameGlass",
        defaultBranch: "trunk",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(fetchGitHubRepositories("bad-token")).rejects.toThrow(
      "GitHub repository lookup failed with 403",
    );
  });
});

describe("fetchGitHubIssues", () => {
  it("fetches open GitHub issues and pull requests and normalizes labels", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        {
          id: 1,
          number: 42,
          title: "Implement dashboard",
          html_url: "https://github.com/jonhickman5/BatonFlow/issues/42",
          state: "open",
          labels: [{ name: "Pending Implementation" }],
          assignees: [{ login: "jon" }],
          created_at: "2026-06-21T00:00:00.000Z",
          updated_at: "2026-06-21T00:10:00.000Z",
        },
        {
          id: 2,
          number: 43,
          title: "A PR",
          html_url: "https://github.com/jonhickman5/BatonFlow/pull/43",
          state: "open",
          labels: [],
          assignees: [],
          created_at: "2026-06-21T00:00:00.000Z",
          updated_at: "2026-06-21T00:10:00.000Z",
          pull_request: {},
        },
      ]),
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchGitHubIssues(repository)).resolves.toEqual([
      {
        id: "1",
        kind: "github_issue",
        number: 42,
        title: "Implement dashboard",
        url: "https://github.com/jonhickman5/BatonFlow/issues/42",
        state: "open",
        labels: ["Pending Implementation"],
        assignees: ["jon"],
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:10:00.000Z",
        eligibleStageIds: [],
      },
      {
        id: "2",
        kind: "github_pull_request",
        number: 43,
        title: "A PR",
        url: "https://github.com/jonhickman5/BatonFlow/pull/43",
        state: "open",
        labels: [],
        assignees: [],
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:10:00.000Z",
        eligibleStageIds: [],
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer github-token",
        }),
      }),
    );
  });

  it("handles string labels, blank label objects, and missing assignees", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([
          {
            id: 3,
            number: 44,
            title: "String labels",
            html_url: "https://github.com/jonhickman5/BatonFlow/issues/44",
            state: "open",
            labels: ["Pending Architecture", { name: null }],
            created_at: "2026-06-21T00:00:00.000Z",
            updated_at: "2026-06-21T00:10:00.000Z",
          },
          {
            id: 4,
            number: 45,
            title: "Missing arrays",
            html_url: "https://github.com/jonhickman5/BatonFlow/issues/45",
            state: "open",
            created_at: "2026-06-21T00:00:00.000Z",
            updated_at: "2026-06-21T00:10:00.000Z",
          },
        ]),
      }),
    );

    await expect(fetchGitHubIssues(repository)).resolves.toMatchObject([
      {
        id: "3",
        kind: "github_issue",
        labels: ["Pending Architecture"],
        assignees: [],
      },
      {
        id: "4",
        kind: "github_issue",
        labels: [],
        assignees: [],
      },
    ]);
  });

  it("surfaces GitHub API failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue("bad credentials"),
      }),
    );

    await expect(fetchGitHubIssues(repository)).rejects.toThrow("GitHub issue sync failed with 401");
  });

  it("requires a connected GitHub token before syncing issues", async () => {
    await expect(fetchGitHubIssues({ ...repository, accessToken: undefined })).rejects.toThrow(
      "A connected GitHub account is required",
    );
  });
});
