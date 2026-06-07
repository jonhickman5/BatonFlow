import { describe, expect, it } from "vitest";
import {
  assertProjectHasValidStartStage,
  getStartStage,
  getValidNextStages,
  summarizeProjectUpdate,
  type Project,
  type Stage,
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
