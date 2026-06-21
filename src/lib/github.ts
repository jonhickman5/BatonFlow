import type {
  GitHubIssueSnapshot,
  GitHubRepositoryConfig,
  GitHubRepositorySummary,
} from "@/lib/data-structures";

export const GITHUB_OAUTH_SCOPE = "repo read:user user:email";

export type GitHubOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type GitHubOAuthToken = {
  accessToken: string;
  tokenType: string;
  scope: string;
};

export type GitHubAuthenticatedUser = {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
};

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

type GitHubOAuthTokenResponse = {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GitHubUserResponse = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
};

type GitHubRepositoryResponse = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  default_branch: string;
  updated_at: string;
  owner: {
    login: string;
  };
  permissions?: Partial<GitHubRepositorySummary["permissions"]>;
};

function labelName(label: string | { name?: string | null }): string | null {
  return typeof label === "string" ? label : label.name ?? null;
}

function githubHeaders(accessToken: string) {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${accessToken}`,
    "x-github-api-version": "2022-11-28",
  };
}

function nextLinkFrom(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }

  for (const link of linkHeader.split(",")) {
    const [rawUrl, rawRel] = link.split(";").map((part) => part.trim());

    if (rawRel === 'rel="next"') {
      return rawUrl.replace(/^<|>$/g, "");
    }
  }

  return null;
}

export function getGitHubOAuthConfig(baseUrl: string): GitHubOAuthConfig | null {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim() ?? "";
  const configuredRedirectUri = process.env.GITHUB_REDIRECT_URI?.trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    redirectUri: configuredRedirectUri || `${baseUrl.replace(/\/$/, "")}/api/github/callback`,
  };
}

export function buildGitHubAuthorizeUrl(config: GitHubOAuthConfig, state: string): string {
  const url = new URL("https://github.com/login/oauth/authorize");

  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", GITHUB_OAUTH_SCOPE);
  url.searchParams.set("state", state);

  return url.toString();
}

export async function exchangeGitHubOAuthCode(
  code: string,
  config: GitHubOAuthConfig,
): Promise<GitHubOAuthToken> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub OAuth token exchange failed with ${response.status}.`);
  }

  const token = (await response.json()) as GitHubOAuthTokenResponse;

  if (!token.access_token || token.error) {
    throw new Error(token.error_description || token.error || "GitHub OAuth token exchange failed.");
  }

  return {
    accessToken: token.access_token,
    tokenType: token.token_type || "bearer",
    scope: token.scope || "",
  };
}

export async function fetchAuthenticatedGitHubUser(accessToken: string): Promise<GitHubAuthenticatedUser> {
  const response = await fetch("https://api.github.com/user", {
    headers: githubHeaders(accessToken),
  });

  if (!response.ok) {
    throw new Error(`GitHub user lookup failed with ${response.status}.`);
  }

  const user = (await response.json()) as GitHubUserResponse;

  return {
    id: user.id,
    login: user.login,
    name: user.name,
    avatarUrl: user.avatar_url,
  };
}

export async function fetchGitHubRepositories(accessToken: string): Promise<GitHubRepositorySummary[]> {
  let url: string | null =
    "https://api.github.com/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&direction=desc&per_page=100";
  const repositories: GitHubRepositorySummary[] = [];

  while (url) {
    const response = await fetch(url, {
      headers: githubHeaders(accessToken),
    });

    if (!response.ok) {
      throw new Error(`GitHub repository lookup failed with ${response.status}.`);
    }

    const page = (await response.json()) as GitHubRepositoryResponse[];

    repositories.push(
      ...page.map((repository) => ({
        id: repository.id,
        owner: repository.owner.login,
        name: repository.name,
        fullName: repository.full_name,
        url: repository.html_url,
        private: repository.private,
        defaultBranch: repository.default_branch,
        updatedAt: repository.updated_at,
        permissions: {
          admin: Boolean(repository.permissions?.admin),
          maintain: Boolean(repository.permissions?.maintain),
          push: Boolean(repository.permissions?.push),
          triage: Boolean(repository.permissions?.triage),
          pull: Boolean(repository.permissions?.pull),
        },
      })),
    );

    url = nextLinkFrom(response.headers.get("link"));
  }

  return repositories;
}

export async function fetchGitHubIssues(
  repository: GitHubRepositoryConfig,
  accessToken = repository.accessToken ?? "",
): Promise<GitHubIssueSnapshot[]> {
  if (!accessToken) {
    throw new Error("A connected GitHub account is required to sync repository issues.");
  }

  const url = new URL(`https://api.github.com/repos/${repository.owner}/${repository.name}/issues`);

  url.searchParams.set("state", "open");
  url.searchParams.set("per_page", "100");
  url.searchParams.set("sort", "updated");
  url.searchParams.set("direction", "desc");

  const response = await fetch(url, {
    headers: githubHeaders(accessToken),
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
