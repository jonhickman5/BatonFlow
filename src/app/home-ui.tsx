"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { signOutAction } from "@/app/actions";
import {
  buildManagerAgentPrompt,
  getActiveManagerCycles,
  getEligibleGitHubIssuesByStage,
  getFailedManagerCycles,
  getTaskStepCount,
  githubIssueTaskKey,
  sortWorkflowStagesByPriority,
} from "@/lib/data-structures";
import type {
  ClientWorkflowProject,
  ClientGitHubAccountConnection,
  GitHubIssueSnapshot,
  GitHubRepositorySummary,
  WorkflowInputRule,
  WorkflowManagerCycle,
  WorkflowOutputRule,
  WorkflowResourceKind,
  WorkflowStageDefinition,
  WorkflowTaskAuditEvent,
} from "@/lib/data-structures";
import {
  createWorkflowProjectAction,
  rotateManagerAccessTokenAction,
  updateWorkflowProjectAction,
} from "@/app/project-actions";
import type { ProjectActionState } from "@/app/project-actions";

type SignedInHomeProps = {
  backendUrl: string;
  githubConnection: ClientGitHubAccountConnection | null;
  githubOAuthConfigured: boolean;
  githubRepositories: GitHubRepositorySummary[];
  githubRepositoryError: string | null;
  projects: ClientWorkflowProject[];
  user: {
    email: string;
    displayName: string | null;
  };
};

type StageEditorProps = {
  canRemove: boolean;
  onChange: (stage: WorkflowStageDefinition) => void;
  onRemove: () => void;
  stage: WorkflowStageDefinition;
};

type RepositoryPickerProps = {
  currentRepositoryFullName?: string | null;
  disabled?: boolean;
  repositories: GitHubRepositorySummary[];
};

const initialActionState: ProjectActionState = {};
const resourceKindOptions: Array<{ label: string; value: WorkflowResourceKind }> = [
  { label: "GitHub issue", value: "github_issue" },
  { label: "GitHub pull request", value: "github_pull_request" },
  { label: "Manual task", value: "manual_task" },
];

const defaultGlobalInstructions = `# Global Instructions

- Keep work scoped to one workflow item per cycle.
- Check active leases and WIP caps before dispatching.
- Preserve project state in GitHub/source control when an integration is configured.
- Verify before handoff and include evidence in every update.`;

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `stage-${Date.now()}-${Math.random()}`;
}

function outputRule(
  label: string,
  holdWhenAtOrAbove: number,
  kind: WorkflowResourceKind = "github_issue",
): WorkflowOutputRule {
  return {
    kind,
    status: "Open",
    label,
    refillWhenAtOrBelow: 0,
    holdWhenAtOrAbove,
  };
}

function inputRule(label: string, kind: WorkflowResourceKind = "github_issue"): WorkflowInputRule {
  return {
    kind,
    status: "Open",
    label,
    minimumReady: 1,
  };
}

function defaultStages(): WorkflowStageDefinition[] {
  return [
    {
      id: newId(),
      name: "Review",
      priority: 1,
      instructionsMarkdown:
        "# Review\n\nIndependently verify the implementation, request fixes for blockers, and approve only when evidence is complete.",
      input: inputRule("Pending Review", "github_pull_request"),
      output: outputRule("Merged", 1, "manual_task"),
    },
    {
      id: newId(),
      name: "Implementation",
      priority: 2,
      instructionsMarkdown:
        "# Implementation\n\nDeliver one implementation-ready issue, update tests/docs, and open a PR with evidence.",
      input: inputRule("Pending Implementation"),
      output: outputRule("Pending Review", 1, "github_pull_request"),
    },
    {
      id: newId(),
      name: "Architecture",
      priority: 3,
      instructionsMarkdown:
        "# Architecture\n\nTurn one architecture-ready issue into a technical plan for implementation.",
      input: inputRule("Pending Architecture"),
      output: outputRule("Pending Implementation", 1),
    },
    {
      id: newId(),
      name: "Planning",
      priority: 4,
      instructionsMarkdown:
        "# Planning\n\nMaintain a small queue of architecture-ready GitHub issues that move the project objective forward.",
      input: null,
      output: outputRule("Pending Architecture", 3),
    },
  ];
}

function createStage(priority: number): WorkflowStageDefinition {
  return {
    id: newId(),
    name: `Stage ${priority}`,
    priority,
    instructionsMarkdown: `# Stage ${priority}\n\nDefine how this agent should move work through the workflow.`,
    input: null,
    output: outputRule("Pending Next", 1),
  };
}

function workflowConfig(globalInstructionsMarkdown: string, stages: WorkflowStageDefinition[]) {
  return JSON.stringify({
    globalInstructionsMarkdown,
    stages,
  });
}

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) {
    return "In progress";
  }

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1000);

  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function repositoryLabel(project: ClientWorkflowProject) {
  return project.repository ? `${project.repository.owner}/${project.repository.name}` : "No repository";
}

function numberFromInput(value: string, fallback: number) {
  const nextValue = Number.parseInt(value, 10);

  return Number.isFinite(nextValue) ? nextValue : fallback;
}

function StageEditor({ canRemove, onChange, onRemove, stage }: StageEditorProps) {
  function updateStage(update: Partial<WorkflowStageDefinition>) {
    onChange({ ...stage, ...update });
  }

  function updateInput(update: Partial<WorkflowInputRule>) {
    if (!stage.input) {
      return;
    }

    updateStage({ input: { ...stage.input, ...update } });
  }

  function updateOutput(update: Partial<WorkflowOutputRule>) {
    updateStage({ output: { ...stage.output, ...update } });
  }

  return (
    <section className="stage-editor" aria-label={`${stage.name} stage`}>
      <div className="stage-editor-heading">
        <label>
          <span>Stage name</span>
          <input
            value={stage.name}
            onChange={(event) => updateStage({ name: event.target.value })}
          />
        </label>
        <label>
          <span>Priority</span>
          <input
            min={1}
            type="number"
            value={stage.priority}
            onChange={(event) =>
              updateStage({ priority: numberFromInput(event.target.value, stage.priority) })
            }
          />
        </label>
        <button type="button" className="secondary-button" disabled={!canRemove} onClick={onRemove}>
          Remove
        </button>
      </div>

      <label className="markdown-editor">
        <span>{stage.name || "stage"}.instructions.md</span>
        <textarea
          value={stage.instructionsMarkdown}
          onChange={(event) => updateStage({ instructionsMarkdown: event.target.value })}
          rows={7}
        />
      </label>

      <div className="rule-grid">
        <fieldset className="rule-fieldset">
          <legend>Input rule</legend>
          <label className="checkbox-row">
            <input
              checked={Boolean(stage.input)}
              type="checkbox"
              onChange={(event) =>
                updateStage({ input: event.target.checked ? inputRule("Pending Input") : null })
              }
            />
            <span>Require upstream work</span>
          </label>
          {stage.input ? (
            <div className="compact-grid">
              <label>
                <span>Type</span>
                <select
                  value={stage.input.kind}
                  onChange={(event) => updateInput({ kind: event.target.value as WorkflowResourceKind })}
                >
                  {resourceKindOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Status</span>
                <input
                  value={stage.input.status}
                  onChange={(event) => updateInput({ status: event.target.value })}
                />
              </label>
              <label>
                <span>Label/tag</span>
                <input
                  value={stage.input.label}
                  onChange={(event) => updateInput({ label: event.target.value })}
                />
              </label>
              <label>
                <span>Min ready</span>
                <input
                  min={0}
                  type="number"
                  value={stage.input.minimumReady}
                  onChange={(event) =>
                    updateInput({
                      minimumReady: numberFromInput(event.target.value, stage.input?.minimumReady ?? 1),
                    })
                  }
                />
              </label>
            </div>
          ) : null}
        </fieldset>

        <fieldset className="rule-fieldset">
          <legend>Output rule</legend>
          <div className="compact-grid">
            <label>
              <span>Type</span>
              <select
                value={stage.output.kind}
                onChange={(event) => updateOutput({ kind: event.target.value as WorkflowResourceKind })}
              >
                {resourceKindOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Status</span>
              <input
                value={stage.output.status}
                onChange={(event) => updateOutput({ status: event.target.value })}
              />
            </label>
            <label>
              <span>Label/tag</span>
              <input
                value={stage.output.label}
                onChange={(event) => updateOutput({ label: event.target.value })}
              />
            </label>
            <label>
              <span>Refill at or below</span>
              <input
                min={0}
                type="number"
                value={stage.output.refillWhenAtOrBelow}
                onChange={(event) =>
                  updateOutput({
                    refillWhenAtOrBelow: numberFromInput(
                      event.target.value,
                      stage.output.refillWhenAtOrBelow,
                    ),
                  })
                }
              />
            </label>
            <label>
              <span>Hold at or above</span>
              <input
                min={1}
                type="number"
                value={stage.output.holdWhenAtOrAbove}
                onChange={(event) =>
                  updateOutput({
                    holdWhenAtOrAbove: numberFromInput(
                      event.target.value,
                      stage.output.holdWhenAtOrAbove,
                    ),
                  })
                }
              />
            </label>
          </div>
        </fieldset>
      </div>
    </section>
  );
}

function ProjectForm({
  githubConnection,
  githubRepositories,
}: {
  githubConnection: ClientGitHubAccountConnection | null;
  githubRepositories: GitHubRepositorySummary[];
}) {
  const [actionState, formAction] = useActionState(createWorkflowProjectAction, initialActionState);
  const [globalInstructionsMarkdown, setGlobalInstructionsMarkdown] =
    useState(defaultGlobalInstructions);
  const [stages, setStages] = useState(defaultStages);
  const config = useMemo(
    () => workflowConfig(globalInstructionsMarkdown, stages),
    [globalInstructionsMarkdown, stages],
  );

  function updateStage(updatedStage: WorkflowStageDefinition) {
    setStages((currentStages) =>
      currentStages.map((stage) => (stage.id === updatedStage.id ? updatedStage : stage)),
    );
  }

  return (
    <form action={formAction} className="project-form">
      <input name="workflowConfig" type="hidden" value={config} />
      <div className="form-grid">
        <label>
          <span>Project name</span>
          <input name="title" placeholder="GameGlass workflow" required />
        </label>
        <label>
          <span>Overall objective</span>
          <textarea
            name="objective"
            placeholder="Define what this workflow should steadily accomplish."
            required
            rows={4}
          />
        </label>
      </div>

      <fieldset className="rule-fieldset">
        <legend>GitHub repository</legend>
        <RepositoryPicker
          disabled={!githubConnection || githubRepositories.length === 0}
          repositories={githubRepositories}
        />
      </fieldset>

      <fieldset className="rule-fieldset">
        <legend>Safety limits</legend>
        <div className="compact-grid">
          <label>
            <span>Max task steps</span>
            <input defaultValue={20} min={1} name="maxTaskSteps" type="number" />
          </label>
          <label>
            <span>Stale after minutes</span>
            <input defaultValue={90} min={1} name="staleAgentMinutes" type="number" />
          </label>
        </div>
      </fieldset>

      <label className="markdown-editor">
        <span>global-instructions.md</span>
        <textarea
          value={globalInstructionsMarkdown}
          onChange={(event) => setGlobalInstructionsMarkdown(event.target.value)}
          rows={8}
        />
      </label>

      <div className="stage-stack">
        {stages.map((stage) => (
          <StageEditor
            canRemove={stages.length > 1}
            key={stage.id}
            onChange={updateStage}
            onRemove={() => setStages((currentStages) => currentStages.filter((item) => item.id !== stage.id))}
            stage={stage}
          />
        ))}
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setStages((currentStages) => [...currentStages, createStage(currentStages.length + 1)])}
        >
          Add stage
        </button>
        <button type="submit" className="primary-button">
          Create project
        </button>
      </div>
      {actionState.error ? <p className="form-error">{actionState.error}</p> : null}
      {actionState.message ? <p className="form-success">{actionState.message}</p> : null}
    </form>
  );
}

function DashboardMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="dashboard-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function GitHubConnectionPanel({
  connection,
  oauthConfigured,
  repositoryError,
}: {
  connection: ClientGitHubAccountConnection | null;
  oauthConfigured: boolean;
  repositoryError: string | null;
}) {
  return (
    <section className="dashboard-panel github-connect-panel" aria-label="GitHub account connection">
      <div className="dashboard-panel-heading">
        <p className="eyebrow">GitHub</p>
        <h3>{connection ? `Connected as ${connection.login}` : "Connect GitHub"}</h3>
      </div>
      {connection ? (
        <div className="github-account-row">
          <span className="github-avatar" aria-hidden="true">
            {(connection.name || connection.login).charAt(0).toUpperCase()}
          </span>
          <div>
            <strong>{connection.name || connection.login}</strong>
            <span>Scopes: {connection.scopes.join(", ") || "none reported"}</span>
          </div>
          <form action="/api/github/disconnect" method="post">
            <button type="submit" className="secondary-button">
              Disconnect
            </button>
          </form>
        </div>
      ) : oauthConfigured ? (
        <a className="primary-button" href="/api/github/connect">
          Sign in with GitHub
        </a>
      ) : (
        <p className="form-error">
          GitHub OAuth is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to the
          server environment.
        </p>
      )}
      {repositoryError ? <p className="form-error">Could not load repositories: {repositoryError}</p> : null}
    </section>
  );
}

function RepositoryPicker({
  currentRepositoryFullName,
  disabled = false,
  repositories,
}: RepositoryPickerProps) {
  const hasCurrentRepository =
    currentRepositoryFullName &&
    !repositories.some((repository) => repository.fullName === currentRepositoryFullName);

  return (
    <label>
      <span>GitHub repository</span>
      <select
        disabled={disabled}
        name="repositoryFullName"
        defaultValue={currentRepositoryFullName ?? ""}
      >
        <option value="">No repository</option>
        {hasCurrentRepository ? (
          <option value={currentRepositoryFullName}>{currentRepositoryFullName} (currently attached)</option>
        ) : null}
        {repositories.map((repository) => (
          <option key={repository.id} value={repository.fullName}>
            {repository.fullName}
            {repository.private ? " private" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function IssueList({ issues }: { issues: GitHubIssueSnapshot[] }) {
  if (issues.length === 0) {
    return <p className="muted-copy">No eligible work items for this stage.</p>;
  }

  return (
    <ul className="issue-list">
      {issues.slice(0, 4).map((issue) => (
        <li key={issue.id}>
          <a href={issue.url} rel="noreferrer" target="_blank">
            #{issue.number} {issue.title}
          </a>
          <span>{issue.labels.join(", ") || "No labels"}</span>
        </li>
      ))}
    </ul>
  );
}

function StageEligibilityBoard({ project }: { project: ClientWorkflowProject }) {
  const stageIssues = getEligibleGitHubIssuesByStage(project);

  return (
    <section className="dashboard-panel" aria-label={`${project.title} stage issue eligibility`}>
      <div className="dashboard-panel-heading">
        <p className="eyebrow">Stage eligibility</p>
        <h4>GitHub work items by stage</h4>
      </div>
      <div className="stage-eligibility-grid">
        {stageIssues.map(({ stage, issues }) => (
          <article className="stage-eligibility-row" key={stage.id}>
            <div>
              <strong>
                {stage.priority}. {stage.name}
              </strong>
              <p>
                {stage.input
                  ? `${stage.input.label || "Unlabeled"} / ${stage.input.status}`
                  : "No upstream GitHub work item input"}
              </p>
            </div>
            <DashboardMetric label="Eligible" value={issues.length} />
            <IssueList issues={issues} />
          </article>
        ))}
      </div>
    </section>
  );
}

function WorkCycleRow({ cycle }: { cycle: WorkflowManagerCycle }) {
  return (
    <li>
      <div>
        <strong>{cycle.taskTitle || cycle.stageName || cycle.status}</strong>
        <span>
          {cycle.stageName || "No stage"} · {cycle.status} · {cycle.stepCount}/{cycle.maxSteps} steps
        </span>
      </div>
      <span>{cycle.lastHeartbeatAt ? `Heartbeat ${formatDate(cycle.lastHeartbeatAt)}` : formatDate(cycle.createdAt)}</span>
      {cycle.failureReason ? <p>{cycle.failureReason}</p> : null}
      {cycle.agents.length > 0 ? (
        <ul className="agent-run-list" aria-label={`${cycle.id} subagents`}>
          {cycle.agents.map((agent) => (
            <li key={agent.id}>
              <strong>{agent.name}</strong>
              <span>
                {agent.stageName || cycle.stageName || "No stage"} · {agent.status} · {agent.stepCount} steps ·{" "}
                {formatDuration(agent.durationMs)}
              </span>
              {agent.terminalState ? <p>{agent.terminalState}</p> : null}
              {agent.failureReason ? <p>{agent.failureReason}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function TaskLifespan({ audit }: { audit: WorkflowTaskAuditEvent[] }) {
  const orderedAudit = [...audit].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const taskRows = [...orderedAudit.reduce((tasks, event) => {
    if (!event.taskKey) {
      return tasks;
    }

    const current = tasks.get(event.taskKey) ?? {
      taskKey: event.taskKey,
      title: event.taskTitle ?? event.taskKey,
      url: event.taskUrl,
      firstSeen: event.createdAt,
      latest: event.createdAt,
      steps: 0,
      durationMs: 0,
      stages: new Map<string, number>(),
      status: event.status,
    };

    current.firstSeen = current.firstSeen < event.createdAt ? current.firstSeen : event.createdAt;
    current.latest = current.latest > event.createdAt ? current.latest : event.createdAt;
    current.steps += event.stepCount;
    current.durationMs += event.durationMs ?? 0;
    if (event.createdAt >= current.latest) {
      current.status = event.status;
    }

    if (event.stageName && event.durationMs) {
      current.stages.set(event.stageName, (current.stages.get(event.stageName) ?? 0) + event.durationMs);
    }

    tasks.set(event.taskKey, current);
    return tasks;
  }, new Map<string, {
    taskKey: string;
    title: string;
    url: string | null;
    firstSeen: string;
    latest: string;
    steps: number;
    durationMs: number;
    stages: Map<string, number>;
    status: string;
  }>()).values()].sort((left, right) => right.latest.localeCompare(left.latest));

  if (taskRows.length === 0) {
    return <p className="muted-copy">No task lifespan history yet.</p>;
  }

  return (
    <div className="table-list" role="table" aria-label="Task lifespan">
      {taskRows.map((task) => (
        <div className="table-row" role="row" key={task.taskKey}>
          <span>
            {task.url ? (
              <a href={task.url} rel="noreferrer" target="_blank">
                {task.title}
              </a>
            ) : (
              task.title
            )}
          </span>
          <span>{task.status}</span>
          <span>{task.steps} steps</span>
          <span>{formatDuration(task.durationMs)}</span>
          <span>
            {[...task.stages.entries()]
              .map(([stage, duration]) => `${stage}: ${formatDuration(duration)}`)
              .join("; ") || "No stage time"}
          </span>
        </div>
      ))}
    </div>
  );
}

function ProjectDashboard({ project }: { project: ClientWorkflowProject }) {
  const activeCycles = getActiveManagerCycles(project);
  const failedCycles = getFailedManagerCycles(project);
  const eligibleIssueCount = project.githubIssueCache.issues.filter(
    (issue) =>
      issue.eligibleStageIds.length > 0 &&
      getTaskStepCount(project, githubIssueTaskKey(issue)) < project.settings.maxTaskSteps,
  ).length;

  return (
    <div className="project-dashboard">
      <section className="dashboard-panel" aria-label={`${project.title} repository status`}>
        <div className="dashboard-panel-heading">
          <p className="eyebrow">Repository</p>
          <h4>{repositoryLabel(project)}</h4>
        </div>
        {project.repository ? (
          <div className="repo-status-grid">
            <DashboardMetric label="Default branch" value={project.repository.defaultBranch} />
            <DashboardMetric label="Cached issues" value={project.githubIssueCache.issues.length} />
            <DashboardMetric label="Last sync" value={formatDate(project.repository.lastSyncedAt)} />
            <DashboardMetric label="Max steps" value={project.settings.maxTaskSteps} />
            <a className="repo-link" href={project.repository.url} rel="noreferrer" target="_blank">
              Open repository
            </a>
            {project.repository.syncError ? (
              <p className="form-error">GitHub sync failed: {project.repository.syncError}</p>
            ) : null}
          </div>
        ) : (
          <p className="muted-copy">Associate one GitHub repository to let BatonFlow manage issue eligibility.</p>
        )}
      </section>

      <div className="dashboard-summary">
        <DashboardMetric label="Eligible issues" value={eligibleIssueCount} />
        <DashboardMetric label="Active cycles" value={activeCycles.length} />
        <DashboardMetric label="Needs review" value={failedCycles.length} />
        <DashboardMetric label="Stale minutes" value={project.settings.staleAgentMinutes} />
      </div>

      <StageEligibilityBoard project={project} />

      <section className="dashboard-panel" aria-label={`${project.title} active work`}>
        <div className="dashboard-panel-heading">
          <p className="eyebrow">Active work</p>
          <h4>Running manager and subagent cycles</h4>
        </div>
        {activeCycles.length > 0 ? (
          <ul className="work-list">
            {activeCycles.map((cycle) => (
              <WorkCycleRow cycle={cycle} key={cycle.id} />
            ))}
          </ul>
        ) : (
          <p className="muted-copy">No active manager cycles.</p>
        )}
      </section>

      <section className="dashboard-panel attention-panel" aria-label={`${project.title} work needing review`}>
        <div className="dashboard-panel-heading">
          <p className="eyebrow">Attention</p>
          <h4>Failed, blocked, stale, or crashed work</h4>
        </div>
        {failedCycles.length > 0 ? (
          <ul className="work-list">
            {failedCycles.map((cycle) => (
              <WorkCycleRow cycle={cycle} key={cycle.id} />
            ))}
          </ul>
        ) : (
          <p className="muted-copy">No failed or stale work.</p>
        )}
      </section>

      <section className="dashboard-panel" aria-label={`${project.title} task lifespan`}>
        <div className="dashboard-panel-heading">
          <p className="eyebrow">Task lifespan</p>
          <h4>Time and steps by task</h4>
        </div>
        <TaskLifespan audit={project.taskAudit} />
      </section>

      <section className="dashboard-panel" aria-label={`${project.title} audit history`}>
        <div className="dashboard-panel-heading">
          <p className="eyebrow">Audit</p>
          <h4>Recent workflow events</h4>
        </div>
        {project.taskAudit.length > 0 ? (
          <div className="table-list" role="table" aria-label="Recent workflow audit">
            {[...project.taskAudit]
              .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
              .slice(0, 8)
              .map((event) => (
              <div className="table-row" role="row" key={event.id}>
                <span>{formatDate(event.createdAt)}</span>
                <span>{event.type}</span>
                <span>{event.stageName ?? "Project"}</span>
                <span>{event.summary}</span>
                <span>{event.stepCount} steps</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted-copy">No audit events yet.</p>
        )}
      </section>
    </div>
  );
}

function ProjectCard({
  backendUrl,
  githubConnection,
  githubRepositories,
  project,
}: {
  backendUrl: string;
  githubConnection: ClientGitHubAccountConnection | null;
  githubRepositories: GitHubRepositorySummary[];
  project: ClientWorkflowProject;
}) {
  const [actionState, formAction] = useActionState(updateWorkflowProjectAction, initialActionState);
  const [title, setTitle] = useState(project.title);
  const [objective, setObjective] = useState(project.objective);
  const [globalInstructionsMarkdown, setGlobalInstructionsMarkdown] = useState(
    project.globalInstructionsMarkdown,
  );
  const [stages, setStages] = useState(project.stages);
  const [copyStatus, setCopyStatus] = useState("Copy manager prompt");
  const managerPrompt = useMemo(
    () => (project.managerAgent.accessToken ? buildManagerAgentPrompt(project, backendUrl) : ""),
    [backendUrl, project],
  );
  const config = useMemo(
    () => workflowConfig(globalInstructionsMarkdown, stages),
    [globalInstructionsMarkdown, stages],
  );
  const priorityList = sortWorkflowStagesByPriority(stages);

  function updateStage(updatedStage: WorkflowStageDefinition) {
    setStages((currentStages) =>
      currentStages.map((stage) => (stage.id === updatedStage.id ? updatedStage : stage)),
    );
  }

  async function copyManagerPrompt() {
    if (!managerPrompt) {
      setCopyStatus("Rotate token first");
      window.setTimeout(() => setCopyStatus("Copy manager prompt"), 1600);
      return;
    }

    await navigator.clipboard.writeText(managerPrompt);
    setCopyStatus("Copied");
    window.setTimeout(() => setCopyStatus("Copy manager prompt"), 1600);
  }

  return (
    <article className="project-card">
      <div className="project-card-header">
        <div>
          <p className="eyebrow">Project</p>
          <h3>{project.title}</h3>
        </div>
        <div className="project-card-actions">
          <button type="button" className="secondary-button" onClick={copyManagerPrompt}>
            {copyStatus}
          </button>
          <form action={rotateManagerAccessTokenAction}>
            <input name="projectId" type="hidden" value={project.id} />
            <button type="submit" className="secondary-button">
              Rotate token
            </button>
          </form>
        </div>
      </div>

      <p className="project-objective">{project.objective}</p>

      <div className="priority-strip" aria-label={`${project.title} agent priority`}>
        {priorityList.map((stage) => (
          <span key={stage.id}>
            {stage.priority}. {stage.name}
          </span>
        ))}
      </div>

      <ProjectDashboard project={project} />

      <details className="manager-prompt-preview">
        <summary>Manager prompt</summary>
        <textarea
          readOnly
          rows={8}
          value={managerPrompt || "Rotate the manager token before copying this prompt."}
        />
      </details>

      <form action={formAction} className="project-form compact-project-form">
        <input name="projectId" type="hidden" value={project.id} />
        <input name="workflowConfig" type="hidden" value={config} />
        <div className="form-grid">
          <label>
            <span>Project name</span>
            <input name="title" value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label>
            <span>Overall objective</span>
            <textarea
              name="objective"
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              required
              rows={4}
            />
          </label>
        </div>

        <fieldset className="rule-fieldset">
          <legend>GitHub repository</legend>
          <RepositoryPicker
            currentRepositoryFullName={
              project.repository?.fullName ?? (project.repository ? repositoryLabel(project) : null)
            }
            disabled={!githubConnection || githubRepositories.length === 0}
            repositories={githubRepositories}
          />
        </fieldset>

        <fieldset className="rule-fieldset">
          <legend>Safety limits</legend>
          <div className="compact-grid">
            <label>
              <span>Max task steps</span>
              <input defaultValue={project.settings.maxTaskSteps} min={1} name="maxTaskSteps" type="number" />
            </label>
            <label>
              <span>Stale after minutes</span>
              <input
                defaultValue={project.settings.staleAgentMinutes}
                min={1}
                name="staleAgentMinutes"
                type="number"
              />
            </label>
          </div>
        </fieldset>

        <label className="markdown-editor">
          <span>global-instructions.md</span>
          <textarea
            value={globalInstructionsMarkdown}
            onChange={(event) => setGlobalInstructionsMarkdown(event.target.value)}
            rows={7}
          />
        </label>

        <div className="stage-stack">
          {stages.map((stage) => (
            <StageEditor
              canRemove={stages.length > 1}
              key={stage.id}
              onChange={updateStage}
              onRemove={() =>
                setStages((currentStages) => currentStages.filter((item) => item.id !== stage.id))
              }
              stage={stage}
            />
          ))}
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setStages((currentStages) => [...currentStages, createStage(currentStages.length + 1)])
            }
          >
            Add stage
          </button>
          <button type="submit" className="primary-button">
            Save project
          </button>
        </div>
        {actionState.error ? <p className="form-error">{actionState.error}</p> : null}
        {actionState.message ? <p className="form-success">{actionState.message}</p> : null}
      </form>
    </article>
  );
}

export function SignedInHome({
  backendUrl,
  githubConnection,
  githubOAuthConfigured,
  githubRepositories,
  githubRepositoryError,
  projects,
  user,
}: SignedInHomeProps) {
  const displayName = user.displayName?.trim() || user.email;

  return (
    <main className="page-shell workspace-shell">
      <header className="site-header">
        <Link href="/" className="brand-mark">
          BatonFlow
        </Link>
        <nav className="header-actions" aria-label="Signed-in navigation">
          <Link href="/account" className="header-link">
            Account
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="header-link button-link">
              Sign out
            </button>
          </form>
        </nav>
      </header>

      <section className="workspace-hero" aria-labelledby="workspace-title">
        <p className="eyebrow">Signed-in home</p>
        <h1 id="workspace-title">Good to see you, {displayName}.</h1>
        <p>
          Create local workflow projects, define their stage agents, and copy the manager prompt that
          asks this backend what to do next.
        </p>
      </section>

      <section className="workspace-band" aria-labelledby="github-title">
        <div className="section-heading">
          <p className="eyebrow">Repository access</p>
          <h2 id="github-title">GitHub connection</h2>
        </div>
        <GitHubConnectionPanel
          connection={githubConnection}
          oauthConfigured={githubOAuthConfigured}
          repositoryError={githubRepositoryError}
        />
      </section>

      <section className="workspace-band" aria-labelledby="new-project-title">
        <div className="section-heading">
          <p className="eyebrow">New project</p>
          <h2 id="new-project-title">Workflow configuration</h2>
        </div>
        <ProjectForm githubConnection={githubConnection} githubRepositories={githubRepositories} />
      </section>

      <section className="workspace-band" aria-labelledby="projects-title">
        <div className="section-heading">
          <p className="eyebrow">Local projects</p>
          <h2 id="projects-title">Project homes</h2>
        </div>
        {projects.length > 0 ? (
          <div className="project-list">
            {projects.map((project) => (
              <ProjectCard
                backendUrl={backendUrl}
                githubConnection={githubConnection}
                githubRepositories={githubRepositories}
                key={project.id}
                project={project}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No projects yet</h3>
            <p>Create the first workflow above. BatonFlow will automatically attach a manager agent.</p>
          </div>
        )}
      </section>
    </main>
  );
}
