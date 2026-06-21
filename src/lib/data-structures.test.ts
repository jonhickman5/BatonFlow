import { describe, expect, it } from "vitest";
import {
  assertProjectHasValidStartStage,
  buildManagerAgentPrompt,
  buildManagerNextPrompt,
  getWorkflowResourceSelectors,
  getStartStage,
  getUserAccountLabel,
  getValidNextStages,
  normalizeEmail,
  selectNextWorkflowStage,
  summarizeProjectUpdate,
  type Project,
  type Stage,
  type UserAccount,
  type WorkflowProject,
} from "./data-structures";

const planningStage: Stage = {
  id: "planning",
  name: "Planning",
  validNextStages: [{ stageId: "architecture", description: "Ready for technical design." }],
  promptId: "prompt-planning",
  additionalContextPromptIds: ["north-star"],
};

const architectureStage: Stage = {
  id: "architecture",
  name: "Architecture",
  validNextStages: [{ stageId: "implementation" }],
  promptId: "prompt-architecture",
  additionalContextPromptIds: ["operations"],
};

const implementationStage: Stage = {
  id: "implementation",
  name: "Implementation",
  validNextStages: [],
  promptId: "prompt-implementation",
  additionalContextPromptIds: [],
};

const project: Project = {
  id: "project-1",
  title: "BatonFlow",
  description: "Local agent workflow setup.",
  stages: [planningStage, architectureStage, implementationStage],
  startStageId: "planning",
  status: "active",
  createdAt: "2026-06-07T00:00:00.000Z",
  lastUpdated: "2026-06-07T00:00:00.000Z",
};

const userAccount: UserAccount = {
  id: "user-1",
  email: "jon@example.com",
  normalizedEmail: "jon@example.com",
  passwordHash: "scrypt$16384$8$1$salt$hash",
  emailVerificationStatus: "verified",
  phoneNumber: null,
  displayName: "Jon",
  planType: "free",
  createdAt: "2026-06-07T00:00:00.000Z",
  lastUpdated: "2026-06-07T00:00:00.000Z",
};

const workflowProject: WorkflowProject = {
  id: "workflow-1",
  ownerUserId: "user-1",
  title: "BatonFlow",
  objective: "Create a reliable manager-led workflow.",
  globalInstructionsMarkdown: "# Global\n\nVerify every handoff.",
  managerAgent: {
    id: "manager-1",
    name: "Manager",
    projectId: "workflow-1",
    accessToken: "bfm_test-token",
    createdAt: "2026-06-07T00:00:00.000Z",
    accessTokenUpdatedAt: "2026-06-07T00:00:00.000Z",
  },
  stages: [
    {
      id: "planning",
      name: "Planning",
      priority: 3,
      instructionsMarkdown: "# Planning\n\nCreate a small issue queue.",
      input: null,
      output: {
        kind: "github_issue",
        status: "Open",
        label: "Pending Architecture",
        refillWhenAtOrBelow: 0,
        holdWhenAtOrAbove: 3,
      },
    },
    {
      id: "implementation",
      name: "Implementation",
      priority: 1,
      instructionsMarkdown: "# Implementation\n\nDeliver one issue.",
      input: {
        kind: "github_issue",
        status: "Open",
        label: "Pending Implementation",
        minimumReady: 1,
      },
      output: {
        kind: "github_pull_request",
        status: "Open",
        label: "Review",
        refillWhenAtOrBelow: 0,
        holdWhenAtOrAbove: 1,
      },
    },
    {
      id: "architecture",
      name: "Architecture",
      priority: 2,
      instructionsMarkdown: "# Architecture\n\nWrite a technical plan.",
      input: {
        kind: "github_issue",
        status: "Open",
        label: "Pending Architecture",
        minimumReady: 1,
      },
      output: {
        kind: "github_issue",
        status: "Open",
        label: "Pending Implementation",
        refillWhenAtOrBelow: 0,
        holdWhenAtOrAbove: 1,
      },
    },
  ],
  createdAt: "2026-06-07T00:00:00.000Z",
  lastUpdated: "2026-06-07T00:00:00.000Z",
};

describe("data structures helpers", () => {
  it("finds the configured start stage", () => {
    expect(getStartStage(project)).toEqual(planningStage);
  });

  it("returns null when the start stage is missing", () => {
    expect(getStartStage({ ...project, startStageId: "missing" })).toBeNull();
  });

  it("returns valid next stages in project stage order", () => {
    expect(getValidNextStages(planningStage, project.stages)).toEqual([architectureStage]);
  });

  it("uses display name for user account labels when present", () => {
    expect(getUserAccountLabel(userAccount)).toBe("Jon");
  });

  it("falls back to email for user account labels", () => {
    expect(getUserAccountLabel({ ...userAccount, displayName: null })).toBe("jon@example.com");
  });

  it("falls back to email for blank display names", () => {
    expect(getUserAccountLabel({ ...userAccount, displayName: "  " })).toBe("jon@example.com");
  });

  it("normalizes emails for account identity", () => {
    expect(normalizeEmail(" Jon@Example.COM ")).toBe("jon@example.com");
  });

  it("enforces a valid start stage", () => {
    expect(() => assertProjectHasValidStartStage(project)).not.toThrow();
    expect(() => assertProjectHasValidStartStage({ ...project, startStageId: "missing" })).toThrow(
      'Project "BatonFlow" must reference a valid start stage.',
    );
  });

  it("prefixes project updates with the stage name when present", () => {
    expect(
      summarizeProjectUpdate(
        {
          id: "update-1",
          projectId: "project-1",
          stageId: "architecture",
          summary: "Posted technical plan",
          details: null,
          createdAt: "2026-06-07T00:00:00.000Z",
        },
        project.stages,
      ),
    ).toBe("Architecture: Posted technical plan");
  });

  it("leaves project updates unprefixed without a matching stage", () => {
    expect(
      summarizeProjectUpdate(
        {
          id: "update-2",
          projectId: "project-1",
          stageId: "unknown",
          summary: "Observed workflow drift",
          details: null,
          createdAt: "2026-06-07T00:00:00.000Z",
        },
        project.stages,
      ),
    ).toBe("Observed workflow drift");
  });

  it("leaves project updates unprefixed when no stage is provided", () => {
    expect(
      summarizeProjectUpdate(
        {
          id: "update-3",
          projectId: "project-1",
          summary: "Manager cycle completed",
          details: null,
          createdAt: "2026-06-07T00:00:00.000Z",
        },
        project.stages,
      ),
    ).toBe("Manager cycle completed");
  });

  it("selects stages by priority while respecting output caps", () => {
    expect(selectNextWorkflowStage(workflowProject)?.name).toBe("Planning");

    expect(
      selectNextWorkflowStage(workflowProject, {
        "github_pull_request:open:review": 1,
        "github_issue:open:pending implementation": 1,
      })?.name,
    ).toBe("Planning");
  });

  it("requires configured input before selecting an input-driven stage", () => {
    expect(
      selectNextWorkflowStage(workflowProject, {
        "github_issue:open:pending architecture": 1,
      })?.name,
    ).toBe("Architecture");

    expect(
      selectNextWorkflowStage(workflowProject, {
        "github_issue:open:pending implementation": 1,
      })?.name,
    ).toBe("Implementation");
  });

  it("deduplicates resource selectors needed for manager counts", () => {
    expect(getWorkflowResourceSelectors(workflowProject).map((resource) => resource.label)).toEqual([
      "Pending Architecture",
      "Pending Implementation",
      "Review",
    ]);
  });

  it("builds a manager bootstrap prompt for the backend next endpoint", () => {
    expect(buildManagerAgentPrompt(workflowProject, "http://localhost:3000/")).toContain(
      "POST request to http://localhost:3000/api/projects/workflow-1/manager/next",
    );
    expect(buildManagerAgentPrompt(workflowProject)).toContain('"managerAgentId":"manager-1"');
    expect(buildManagerAgentPrompt(workflowProject)).toContain('"resourceCounts"');
  });

  it("refuses to build a manager prompt without a durable access token", () => {
    expect(() =>
      buildManagerAgentPrompt({
        ...workflowProject,
        managerAgent: { ...workflowProject.managerAgent, accessToken: "" },
      }),
    ).toThrow("Manager access token is missing.");
  });

  it("builds the next manager prompt from project-wide and stage instructions", () => {
    const nextPrompt = buildManagerNextPrompt(workflowProject, {
      "github_pull_request:open:review": 1,
      "github_issue:open:pending architecture": 1,
    });

    expect(nextPrompt.selectedStageName).toBe("Architecture");
    expect(nextPrompt.prompt).toContain("Objective: Create a reliable manager-led workflow.");
    expect(nextPrompt.prompt).toContain("# Global");
    expect(nextPrompt.prompt).toContain("# Architecture");
    expect(nextPrompt.prompt).toContain("do not run at or above 1");
  });

  it("builds a stop prompt when a project has no eligible stages", () => {
    const nextPrompt = buildManagerNextPrompt({ ...workflowProject, stages: [] });

    expect(nextPrompt.selectedStageId).toBeNull();
    expect(nextPrompt.prompt).toContain("No eligible stage is configured");
  });
});
