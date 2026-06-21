import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/session";
import { GET, GITHUB_OAUTH_STATE_COOKIE } from "./route";

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/github", () => ({
  buildGitHubAuthorizeUrl: vi.fn(() => "https://github.com/login/oauth/authorize?state=test-state"),
  getGitHubOAuthConfig: vi.fn(() => ({
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "http://localhost/api/github/callback",
  })),
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

describe("GET /api/github/connect", () => {
  it("requires a BatonFlow session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost/api/github/connect"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/sign-in");
  });

  it("sets OAuth state and redirects to GitHub", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const response = await GET(new NextRequest("http://localhost/api/github/connect"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("https://github.com/login/oauth/authorize");
    expect(response.headers.get("set-cookie")).toContain(GITHUB_OAUTH_STATE_COOKIE);
  });
});
