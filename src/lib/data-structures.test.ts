import { describe, expect, it } from "vitest";
import {
  assertProjectHasValidStartStage,
  buildManagerAgentPrompt,
  buildManagerNextPrompt,
  getActiveManagerCycles,
  getEligibleGitHubIssuesByStage,
  getFailedManagerCycles,
  getGitHubIssueSwimlanes,
  getTaskStepCount,
  getWorkflowResourceSelectors,
  getStartStage,
  getUserAccountLabel,
  getValidNextStages,
  issueMatchesWorkflowSelector,
  markStaleManagerCycles,
  normalizeEmail,
  sanitizeWorkflowProjectForClient,
  selectNextWorkflowStage,
  workflowResourceCountsFromIssues,
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
  repository: {
    provider: "github",
    owner: "jonhickman5",
    name: "BatonFlow",
    url: "https://github.com/jonhickman5/BatonFlow",
    defaultBranch: "main",
    accessToken: "github-token",
    connectedAt: "2026-06-07T00:00:00.000Z",
    lastSyncedAt: "2026-06-07T00:00:00.000Z",
    syncError: null,
  },
  settings: {
    maxTaskSteps: 20,
    staleAgentMinutes: 90,
  },
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
  githubIssueCache: {
    syncedAt: "2026-06-07T00:00:00.000Z",
    error: null,
    issues: [
      {
        id: "issue-1",
        number: 1,
        title: "Needs architecture",
        url: "https://github.com/jonhickman5/BatonFlow/issues/1",
        state: "open",
        labels: ["Pending Architecture"],
        assignees: ["jon"],
        createdAt: "2026-06-07T00:00:00.000Z",
        updatedAt: "2026-06-07T01:00:00.000Z",
        eligibleStageIds: ["architecture"],
      },
      {
        id: "issue-2",
        number: 2,
        title: "Needs implementation",
        url: "https://github.com/jonhickman5/BatonFlow/issues/2",
        state: "open",
        labels: ["Pending Implementation"],
        assignees: [],
        createdAt: "2026-06-07T00:00:00.000Z",
        updatedAt: "2026-06-07T01:00:00.000Z",
        eligibleStageIds: ["implementation"],
      },
    ],
  },
  managerCycles: [
    {
      id: "cycle-running",
      managerAgentId: "manager-1",
      stageId: "implementation",
      stageName: "Implementation",
      taskKey: "github_issue:2",
      taskTitle: "Needs implementation",
      taskUrl: "https://github.com/jonhickman5/BatonFlow/issues/2",
      status: "running",
      prompt: "Do implementation.",
      createdAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
      completedAt: null,
      lastHeartbeatAt: "2026-06-07T00:00:00.000Z",
      maxSteps: 20,
      stepCount: 3,
      agents: [],
      failureReason: null,
      terminalSummary: null,
    },
    {
      id: "cycle-failed",
      managerAgentId: "manager-1",
      stageId: "architecture",
      stageName: "Architecture",
      taskKey: "github_issue:1",
      taskTitle: "Needs architecture",
      taskUrl: "https://github.com/jonhickman5/BatonFlow/issues/1",
      status: "failed",
      prompt: "Do architecture.",
      createdAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:10:00.000Z",
      completedAt: "2026-06-07T00:10:00.000Z",
      lastHeartbeatAt: "2026-06-07T00:10:00.000Z",
      maxSteps: 20,
      stepCount: 4,
      agents: [],
      failureReason: "Worker failed.",
      terminalSummary: "Failed.",
    },
  ],
  taskAudit: [
    {
      id: "audit-1",
      cycleId: "cycle-failed",
      agentId: "agent-1",
      taskKey: "github_issue:1",
      taskTitle: "Needs architecture",
      taskUrl: "https://github.com/jonhickman5/BatonFlow/issues/1",
      stageId: "architecture",
      stageName: "Architecture",
      type: "agent_reported",
      summary: "Architecture failed.",
      createdAt: "2026-06-07T00:10:00.000Z",
      durationMs: 600000,
      stepCount: 4,
      status: "failed",
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

  it("derives GitHub issue eligibility and resource counts from cached issues", () => {
    const eligibility = getEligibleGitHubIssuesByStage(workflowProject);

    expect(eligibility.find((entry) => entry.stage.name === "Architecture")?.issues[0].number).toBe(1);
    expect(eligibility.find((entry) => entry.stage.name === "Implementation")?.issues[0].number).toBe(2);
    expect(workflowResourceCountsFromIssues(workflowProject)).toMatchObject({
      "github_issue:open:pending architecture": 1,
      "github_issue:open:pending implementation": 1,
    });
  });

  it("groups GitHub issues into stage swimlanes with unmatched issues last", () => {
    const swimlaneProject: WorkflowProject = {
      ...workflowProject,
      githubIssueCache: {
        ...workflowProject.githubIssueCache,
        issues: [
          ...workflowProject.githubIssueCache.issues,
          {
            id: "issue-3",
            number: 3,
            title: "Needs triage",
            url: "https://github.com/jonhickman5/BatonFlow/issues/3",
            state: "open",
            labels: ["Question"],
            assignees: [],
            createdAt: "2026-06-07T00:00:00.000Z",
            updatedAt: "2026-06-07T01:00:00.000Z",
            eligibleStageIds: [],
          },
        ],
      },
    };
    const lanes = getGitHubIssueSwimlanes(swimlaneProject);

    expect(lanes.map((lane) => lane.title)).toEqual([
      "Implementation",
      "Architecture",
      "Planning",
      "Unmatched",
    ]);
    expect(lanes.find((lane) => lane.title === "Implementation")?.issues.map((issue) => issue.number)).toEqual([2]);
    expect(lanes.find((lane) => lane.title === "Architecture")?.issues.map((issue) => issue.number)).toEqual([1]);
    expect(lanes.find((lane) => lane.title === "Unmatched")?.issues.map((issue) => issue.number)).toEqual([3]);
  });

  it("derives GitHub pull request eligibility and resource counts from cached items", () => {
    const pullRequestProject: WorkflowProject = {
      ...workflowProject,
      stages: [
        {
          id: "review",
          name: "Review",
          priority: 0,
          instructionsMarkdown: "# Review\n\nVerify the PR.",
          input: {
            kind: "github_pull_request",
            status: "Open",
            label: "Review",
            minimumReady: 1,
          },
          output: {
            kind: "manual_task",
            status: "Done",
            label: "Merged",
            refillWhenAtOrBelow: 0,
            holdWhenAtOrAbove: 1,
          },
        },
        ...workflowProject.stages,
      ],
      githubIssueCache: {
        ...workflowProject.githubIssueCache,
        issues: [
          ...workflowProject.githubIssueCache.issues,
          {
            id: "pull-7",
            kind: "github_pull_request",
            number: 7,
            title: "Ready for review",
            url: "https://github.com/jonhickman5/BatonFlow/pull/7",
            state: "open",
            labels: ["Review"],
            assignees: [],
            createdAt: "2026-06-07T00:00:00.000Z",
            updatedAt: "2026-06-07T01:00:00.000Z",
            eligibleStageIds: [],
          },
        ],
      },
    };

    expect(workflowResourceCountsFromIssues(pullRequestProject)).toMatchObject({
      "github_pull_request:open:review": 1,
    });
    expect(
      issueMatchesWorkflowSelector(pullRequestProject.githubIssueCache.issues[2], {
        kind: "github_pull_request",
        status: "Open",
        label: "Review",
      }),
    ).toBe(true);
    expect(
      buildManagerNextPrompt(
        pullRequestProject,
        {
          "github_pull_request:open:review": 1,
          "github_issue:open:pending architecture": 1,
        },
        "cycle-review",
      ).prompt,
    ).toContain("Selected GitHub pull request: #7");
  });

  it("counts unsupported cached resource selectors as zero", () => {
    const counts = workflowResourceCountsFromIssues({
      ...workflowProject,
      stages: [
        {
          ...workflowProject.stages[0],
          output: {
            kind: "manual_task",
            status: "Ready",
            label: "Human Review",
            refillWhenAtOrBelow: 0,
            holdWhenAtOrAbove: 1,
          },
        },
      ],
    });

    expect(counts["manual_task:ready:human review"]).toBe(0);
  });

  it("sanitizes repository credentials before projects are passed to the client", () => {
    const sanitizedProject = sanitizeWorkflowProjectForClient(workflowProject);

    expect(sanitizedProject.repository).toMatchObject({
      owner: "jonhickman5",
      name: "BatonFlow",
      hasAccessToken: true,
    });
    expect(JSON.stringify(sanitizedProject)).not.toContain("github-token");
  });

  it("matches GitHub issue selectors case-insensitively and rejects unsupported resources", () => {
    const issue = workflowProject.githubIssueCache.issues[0];

    expect(
      issueMatchesWorkflowSelector(issue, {
        kind: "github_issue",
        status: "Opened",
        label: "pending architecture",
      }),
    ).toBe(true);
    expect(
      issueMatchesWorkflowSelector(issue, {
        kind: "github_issue",
        status: "Open",
        label: "",
      }),
    ).toBe(true);
    expect(
      issueMatchesWorkflowSelector(issue, {
        kind: "manual_task",
        status: "Open",
        label: "Pending Architecture",
      }),
    ).toBe(false);
  });

  it("tracks active and failed manager cycles plus task steps", () => {
    expect(getActiveManagerCycles(workflowProject)).toHaveLength(1);
    expect(getFailedManagerCycles(workflowProject)).toHaveLength(1);
    expect(getTaskStepCount(workflowProject, "github_issue:1")).toBe(4);
  });

  it("marks stale running cycles as failures", () => {
    const updatedProject = markStaleManagerCycles(
      workflowProject,
      new Date("2026-06-07T03:00:00.000Z"),
    );

    expect(updatedProject.managerCycles.find((cycle) => cycle.id === "cycle-running")?.status).toBe("stale");
    expect(updatedProject.taskAudit[updatedProject.taskAudit.length - 1].type).toBe("stale_failure");
  });

  it("leaves fresh cycles unchanged during stale checks", () => {
    expect(markStaleManagerCycles(workflowProject, new Date("2026-06-07T00:05:00.000Z"))).toBe(
      workflowProject,
    );
  });

  it("builds a manager bootstrap prompt for the backend next endpoint", () => {
    expect(buildManagerAgentPrompt(workflowProject, "http://localhost:3000/")).toContain(
      "POST request to http://localhost:3000/api/projects/workflow-1/manager/next",
    );
    expect(buildManagerAgentPrompt(workflowProject)).toContain('"managerAgentId":"manager-1"');
    expect(buildManagerAgentPrompt(workflowProject)).toContain("/manager/report");
    expect(buildManagerAgentPrompt(workflowProject)).not.toContain("github-token");
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
    expect(nextPrompt.cycleId).toBeNull();
    expect(nextPrompt.taskKey).toBe("github_issue:1");
    expect(nextPrompt.prompt).toContain("Objective: Create a reliable manager-led workflow.");
    expect(nextPrompt.prompt).toContain("# Global");
    expect(nextPrompt.prompt).toContain("# Architecture");
    expect(nextPrompt.prompt).toContain("do not run at or above 1");
  });

  it("builds a dispatch prompt for refill stages without an existing GitHub issue", () => {
    const nextPrompt = buildManagerNextPrompt(
      workflowProject,
      {
        "github_pull_request:open:review": 1,
        "github_issue:open:pending architecture": 0,
        "github_issue:open:pending implementation": 0,
      },
      "cycle-planning",
    );

    expect(nextPrompt.decision).toBe("dispatch");
    expect(nextPrompt.selectedStageName).toBe("Planning");
    expect(nextPrompt.cycleId).toBe("cycle-planning");
    expect(nextPrompt.taskKey).toBeNull();
    expect(nextPrompt.prompt).toContain("Input: no upstream input is required for this stage.");
    expect(nextPrompt.prompt).toContain(
      "Selected task: queue/refill cycle; no existing GitHub work item is assigned.",
    );
  });

  it("builds a safety stop prompt when every matching issue reached the step limit", () => {
    const nextPrompt = buildManagerNextPrompt(
      {
        ...workflowProject,
        settings: {
          ...workflowProject.settings,
          maxTaskSteps: 4,
        },
      },
      {
        "github_pull_request:open:review": 1,
        "github_issue:open:pending architecture": 1,
      },
      "cycle-steps",
    );

    expect(nextPrompt.decision).toBe("stop");
    expect(nextPrompt.reason).toBe("no_eligible_issue_or_step_limit");
    expect(nextPrompt.prompt).toContain("max step limit");
  });

  it("builds a stop prompt when a project has no eligible stages", () => {
    const nextPrompt = buildManagerNextPrompt({ ...workflowProject, stages: [] });

    expect(nextPrompt.selectedStageId).toBeNull();
    expect(nextPrompt.prompt).toContain("No eligible stage is configured");
  });
});
