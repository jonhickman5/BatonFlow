import { describe, expect, it } from "vitest";
import {
  assertProjectHasValidStartStage,
  getStartStage,
  getUserAccountLabel,
  getValidNextStages,
  normalizeEmail,
  summarizeProjectUpdate,
  type Project,
  type Stage,
  type UserAccount,
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
});
