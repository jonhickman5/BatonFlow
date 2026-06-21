import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthStore } from "@/lib/auth-store";
import { getCurrentUser } from "@/lib/session";
import { POST } from "./route";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth-store", () => ({
  getAuthStore: vi.fn(),
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

describe("POST /api/github/disconnect", () => {
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
  });

  it("requires a BatonFlow session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/github/disconnect", { method: "POST" }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/sign-in");
    expect(getAuthStore().deleteGitHubConnection).not.toHaveBeenCalled();
  });

  it("disconnects the current user's GitHub account", async () => {
    const store = getAuthStore();
    const response = await POST(new Request("http://localhost/api/github/disconnect", { method: "POST" }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/?github=disconnected");
    expect(store.deleteGitHubConnection).toHaveBeenCalledWith("user-1");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });
});
