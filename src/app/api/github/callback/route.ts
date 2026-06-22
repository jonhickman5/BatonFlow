import { NextRequest, NextResponse } from "next/server";
import { getAuthStore } from "@/lib/auth-store";
import {
  exchangeGitHubOAuthCode,
  fetchAuthenticatedGitHubUser,
  getGitHubOAuthConfig,
} from "@/lib/github";
import { getCurrentUser } from "@/lib/session";
import { GITHUB_OAUTH_STATE_COOKIE } from "@/app/api/github/connect/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function redirectHome(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/?github=${status}`, request.nextUrl.origin));
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", request.nextUrl.origin));
  }

  const expectedState = request.cookies.get(GITHUB_OAUTH_STATE_COOKIE)?.value ?? "";
  const receivedState = request.nextUrl.searchParams.get("state") ?? "";
  const code = request.nextUrl.searchParams.get("code") ?? "";

  if (!expectedState || !receivedState || expectedState !== receivedState) {
    const response = redirectHome(request, "invalid_state");
    response.cookies.delete(GITHUB_OAUTH_STATE_COOKIE);
    return response;
  }

  if (!code) {
    const response = redirectHome(request, "missing_code");
    response.cookies.delete(GITHUB_OAUTH_STATE_COOKIE);
    return response;
  }

  const config = getGitHubOAuthConfig(request.nextUrl.origin);

  if (!config) {
    const response = redirectHome(request, "missing_config");
    response.cookies.delete(GITHUB_OAUTH_STATE_COOKIE);
    return response;
  }

  try {
    const token = await exchangeGitHubOAuthCode(code, config);
    const githubUser = await fetchAuthenticatedGitHubUser(token.accessToken);

    await getAuthStore().upsertGitHubConnection({
      userId: user.id,
      githubUserId: githubUser.id,
      login: githubUser.login,
      name: githubUser.name,
      avatarUrl: githubUser.avatarUrl,
      accessToken: token.accessToken,
      tokenType: token.tokenType,
      scope: token.scope,
    });
  } catch {
    const response = redirectHome(request, "connect_failed");
    response.cookies.delete(GITHUB_OAUTH_STATE_COOKIE);
    return response;
  }

  const response = redirectHome(request, "connected");
  response.cookies.delete(GITHUB_OAUTH_STATE_COOKIE);
  return response;
}
