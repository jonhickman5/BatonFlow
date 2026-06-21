import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGitHubIssues } from "@/lib/github";
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
});
