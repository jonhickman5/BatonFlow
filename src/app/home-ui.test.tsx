import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignedInHome } from "./home-ui";
import type { WorkflowProject } from "@/lib/data-structures";

vi.mock("@/app/actions", () => ({
  signOutAction: vi.fn(),
}));

vi.mock("@/app/project-actions", () => ({
  createWorkflowProjectAction: vi.fn(async () => ({ message: "Project created." })),
  rotateManagerAccessTokenAction: vi.fn(),
  updateWorkflowProjectAction: vi.fn(async () => ({ message: "Project saved." })),
}));

const workflowProject: WorkflowProject = {
  id: "project-1",
  ownerUserId: "user-1",
  title: "GameGlass",
  objective: "Keep GameGlass workflow items moving.",
  globalInstructionsMarkdown: "# Global\n\nCheck leases first.",
  managerAgent: {
    id: "manager-1",
    name: "Manager",
    projectId: "project-1",
    accessToken: "bfm_test-token",
    createdAt: "2026-06-21T00:00:00.000Z",
    accessTokenUpdatedAt: "2026-06-21T00:00:00.000Z",
  },
  stages: [
    {
      id: "implementation",
      name: "Implementation",
      priority: 1,
      instructionsMarkdown: "# Implementation\n\nShip one issue.",
      input: {
        kind: "github_issue",
        status: "Open",
        label: "Pending Implementation",
        minimumReady: 1,
      },
      output: {
        kind: "github_pull_request",
        status: "Open",
        label: "Pending Review",
        refillWhenAtOrBelow: 0,
        holdWhenAtOrAbove: 1,
      },
    },
  ],
  createdAt: "2026-06-21T00:00:00.000Z",
  lastUpdated: "2026-06-21T00:00:00.000Z",
};

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

describe("SignedInHome", () => {
  it("renders the project creation workflow with default stage agents", () => {
    render(
      <SignedInHome
        backendUrl="http://127.0.0.1:3000"
        projects={[]}
        user={{ displayName: "Jon", email: "jon@example.com" }}
      />,
    );

    expect(screen.getByRole("heading", { name: /Good to see you, Jon/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Project name")).toBeInTheDocument();
    expect(screen.getByText("global-instructions.md")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Planning stage" })).toBeInTheDocument();
    expect(screen.getByText("No projects yet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add stage" }));

    expect(screen.getByRole("region", { name: "Stage 5 stage" })).toBeInTheDocument();
  });

  it("renders saved projects and copies the manager prompt", async () => {
    render(
      <SignedInHome
        backendUrl="http://localhost:3000"
        projects={[workflowProject]}
        user={{ displayName: null, email: "jon@example.com" }}
      />,
    );

    const projectCard = screen.getByRole("article");

    expect(within(projectCard).getByRole("heading", { name: "GameGlass" })).toBeInTheDocument();
    expect(within(projectCard).getByText("1. Implementation")).toBeInTheDocument();
    expect(within(projectCard).getByRole("button", { name: "Rotate token" })).toBeInTheDocument();

    fireEvent.click(within(projectCard).getByRole("button", { name: "Copy manager prompt" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("/api/projects/project-1/manager/next"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("Authorization: Bearer bfm_test-token"),
    );
  });
});
