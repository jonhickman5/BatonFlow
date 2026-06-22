import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

type AuthSnapshot = {
  githubConnections?: Array<Record<string, unknown>>;
  users?: Array<{ id: string; email: string; normalizedEmail: string }>;
};

export type LiveGitHubConfig = {
  token: string;
  repository: string;
};

export type LiveGitHubUser = {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
};

export type LiveGitHubIssue = {
  number: number;
  html_url: string;
  title?: string;
};

function ghCliToken(): string {
  try {
    return execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function liveGitHubConfig(): LiveGitHubConfig | null {
  if (process.env.E2E_ALLOW_MUTATING_GITHUB !== "true") {
    return null;
  }

  const token = process.env.E2E_GITHUB_TOKEN?.trim() || ghCliToken();
  const repository = process.env.E2E_GITHUB_REPOSITORY?.trim() || "jonhickman5/scrap";

  return token && repository ? { token, repository } : null;
}

export function splitRepository(repository: string) {
  const [owner, name] = repository.split("/");

  if (!owner || !name) {
    throw new Error("E2E_GITHUB_REPOSITORY must be in owner/name format.");
  }

  return { owner, name };
}

async function githubRequest<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(`GitHub request failed with ${response.status}: ${body.slice(0, 180)}`);
  }

  return (await response.json()) as T;
}

export async function fetchLiveGitHubUser(token: string): Promise<LiveGitHubUser> {
  const user = await githubRequest<{
    id: number;
    login: string;
    name: string | null;
    avatar_url: string | null;
  }>(token, "/user");

  return {
    id: user.id,
    login: user.login,
    name: user.name,
    avatarUrl: user.avatar_url,
  };
}

export async function ensureIssueLabel(token: string, repository: string, label: string) {
  const { owner, name } = splitRepository(repository);
  const response = await fetch(`https://api.github.com/repos/${owner}/${name}/labels`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({
      color: label.includes("Review") ? "c2e0c6" : "fef2c0",
      description: "BatonFlow e2e workflow label",
      name: label,
    }),
  });

  if (response.status === 422) {
    return;
  }

  if (!response.ok) {
    const body = await response.text();

    throw new Error(`Could not create GitHub label ${label}: ${body.slice(0, 180)}`);
  }
}

export async function listOpenIssuesWithLabel(
  token: string,
  repository: string,
  label: string,
): Promise<LiveGitHubIssue[]> {
  const { owner, name } = splitRepository(repository);
  const params = new URLSearchParams({
    labels: label,
    per_page: "20",
    state: "open",
  });
  const issues = await githubRequest<
    Array<LiveGitHubIssue & { pull_request?: unknown; title: string }>
  >(token, `/repos/${owner}/${name}/issues?${params.toString()}`);

  return issues.filter((issue) => !issue.pull_request);
}

export async function createLiveIssue(
  token: string,
  repository: string,
  title: string,
  labels: string[],
): Promise<LiveGitHubIssue> {
  const { owner, name } = splitRepository(repository);

  return githubRequest<LiveGitHubIssue>(token, `/repos/${owner}/${name}/issues`, {
    method: "POST",
    body: JSON.stringify({
      body: "Created by BatonFlow live e2e. Safe to close/delete after the run.",
      labels,
      title,
    }),
  });
}

export async function setLiveIssueLabels(
  token: string,
  repository: string,
  issueNumber: number,
  labels: string[],
) {
  const { owner, name } = splitRepository(repository);

  await githubRequest(token, `/repos/${owner}/${name}/issues/${issueNumber}`, {
    method: "PATCH",
    body: JSON.stringify({ labels }),
  });
}

export async function closeLiveIssue(token: string, repository: string, issueNumber: number) {
  const { owner, name } = splitRepository(repository);

  await githubRequest(token, `/repos/${owner}/${name}/issues/${issueNumber}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed" }),
  });
}

export async function findE2EUserByEmail(authStorePath: string, email: string) {
  const snapshot = JSON.parse(await readFile(authStorePath, "utf8")) as AuthSnapshot;
  const normalizedEmail = email.trim().toLowerCase();

  return snapshot.users?.find((user) => user.normalizedEmail === normalizedEmail) ?? null;
}

export async function seedGitHubConnection(
  authStorePath: string,
  userId: string,
  githubUser: LiveGitHubUser,
  token: string,
) {
  const snapshot = JSON.parse(await readFile(authStorePath, "utf8")) as AuthSnapshot;
  const now = new Date().toISOString();

  snapshot.githubConnections = [
    ...(snapshot.githubConnections ?? []).filter((connection) => connection.userId !== userId),
    {
      userId,
      githubUserId: githubUser.id,
      login: githubUser.login,
      name: githubUser.name,
      avatarUrl: githubUser.avatarUrl,
      accessToken: token,
      tokenType: "bearer",
      scope: "repo read:user user:email",
      connectedAt: now,
      lastUpdated: now,
    },
  ];

  await writeFile(authStorePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}
