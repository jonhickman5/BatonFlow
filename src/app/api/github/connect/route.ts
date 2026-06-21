import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildGitHubAuthorizeUrl, getGitHubOAuthConfig } from "@/lib/github";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GITHUB_OAUTH_STATE_COOKIE = "batonflow_github_oauth_state";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const baseUrl = request.nextUrl.origin;

  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", baseUrl));
  }

  const config = getGitHubOAuthConfig(baseUrl);

  if (!config) {
    return NextResponse.redirect(new URL("/?github=missing_config", baseUrl));
  }

  const state = randomBytes(32).toString("base64url");
  const response = NextResponse.redirect(buildGitHubAuthorizeUrl(config, state));

  response.cookies.set(GITHUB_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
