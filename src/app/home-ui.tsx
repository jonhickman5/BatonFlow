"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { signOutAction } from "@/app/actions";
import {
  buildManagerAgentPrompt,
  sortWorkflowStagesByPriority,
} from "@/lib/data-structures";
import type {
  WorkflowInputRule,
  WorkflowOutputRule,
  WorkflowProject,
  WorkflowResourceKind,
  WorkflowStageDefinition,
} from "@/lib/data-structures";
import {
  createWorkflowProjectAction,
  rotateManagerAccessTokenAction,
  updateWorkflowProjectAction,
} from "@/app/project-actions";
import type { ProjectActionState } from "@/app/project-actions";

type SignedInHomeProps = {
  backendUrl: string;
  projects: WorkflowProject[];
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

function ProjectForm() {
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

function ProjectCard({ backendUrl, project }: { backendUrl: string; project: WorkflowProject }) {
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

export function SignedInHome({ backendUrl, projects, user }: SignedInHomeProps) {
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

      <section className="workspace-band" aria-labelledby="new-project-title">
        <div className="section-heading">
          <p className="eyebrow">New project</p>
          <h2 id="new-project-title">Workflow configuration</h2>
        </div>
        <ProjectForm />
      </section>

      <section className="workspace-band" aria-labelledby="projects-title">
        <div className="section-heading">
          <p className="eyebrow">Local projects</p>
          <h2 id="projects-title">Project homes</h2>
        </div>
        {projects.length > 0 ? (
          <div className="project-list">
            {projects.map((project) => (
              <ProjectCard backendUrl={backendUrl} key={project.id} project={project} />
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
