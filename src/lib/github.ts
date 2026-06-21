import type { GitHubIssueSnapshot, GitHubRepositoryConfig } from "@/lib/data-structures";

type GitHubIssueResponse = {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  labels?: Array<string | { name?: string | null }>;
  assignees?: Array<{ login?: string | null }>;
  created_at: string;
  updated_at: string;
  pull_request?: unknown;
};

function labelName(label: string | { name?: string | null }): string | null {
  return typeof label === "string" ? label : label.name ?? null;
}

export async function fetchGitHubIssues(repository: GitHubRepositoryConfig): Promise<GitHubIssueSnapshot[]> {
  const url = new URL(`https://api.github.com/repos/${repository.owner}/${repository.name}/issues`);

  url.searchParams.set("state", "open");
  url.searchParams.set("per_page", "100");
  url.searchParams.set("sort", "updated");
  url.searchParams.set("direction", "desc");

  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${repository.accessToken}`,
      "x-github-api-version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const message = await response.text();

    throw new Error(`GitHub issue sync failed with ${response.status}: ${message.slice(0, 180)}`);
  }

  const issues = (await response.json()) as GitHubIssueResponse[];

  return issues
    .map((issue) => ({
      id: String(issue.id),
      kind: issue.pull_request ? "github_pull_request" : "github_issue",
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      state: issue.state,
      labels: (issue.labels ?? []).map(labelName).filter((label): label is string => Boolean(label)),
      assignees: (issue.assignees ?? [])
        .map((assignee) => assignee.login)
        .filter((assignee): assignee is string => Boolean(assignee)),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      eligibleStageIds: [],
    }));
}
