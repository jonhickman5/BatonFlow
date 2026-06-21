import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home, { PublicLanding } from "./page";
import { getProjectStore } from "@/lib/project-store";
import { getCurrentUser } from "@/lib/session";

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/project-store", () => ({
  getProjectStore: vi.fn(),
}));

vi.mock("@/app/home-ui", () => ({
  SignedInHome: ({ user }: { user: { email: string } }) => (
    <main>Signed-in workflow home for {user.email}</main>
  ),
}));

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  vi.mocked(getProjectStore).mockReturnValue({
    listProjects: vi.fn().mockResolvedValue([]),
    getProject: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    rotateManagerAccessToken: vi.fn(),
  });
});

describe("Home", () => {
  it("renders the BatonFlow landing surface", () => {
    render(<PublicLanding />);

    expect(screen.getByRole("heading", { name: "BatonFlow" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(screen.getByRole("link", { name: "Start with an account" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(screen.getByRole("heading", { name: "Workflow canvas coming soon" })).toBeInTheDocument();
  });

  it("renders the signed-in workflow home for authenticated users", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-1",
      email: "jon@example.com",
      normalizedEmail: "jon@example.com",
      passwordHash: null,
      emailVerificationStatus: "verified",
      phoneNumber: null,
      displayName: "Jon",
      planType: "free",
      createdAt: new Date("2026-06-21T00:00:00.000Z"),
      lastUpdated: new Date("2026-06-21T00:00:00.000Z"),
    });

    render(await Home());

    expect(screen.getByText("Signed-in workflow home for jon@example.com")).toBeInTheDocument();
    expect(getProjectStore().listProjects).toHaveBeenCalledWith("user-1");
  });

  it("renders the public landing from the default home route for guests", async () => {
    render(await Home());

    expect(screen.getByRole("heading", { name: "BatonFlow" })).toBeInTheDocument();
  });
});
