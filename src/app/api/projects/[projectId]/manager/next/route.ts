import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildManagerNextPrompt,
  getActiveManagerCycles,
  workflowResourceCountsFromIssues,
} from "@/lib/data-structures";
import { getAuthStore } from "@/lib/auth-store";
import { fetchGitHubIssues } from "@/lib/github";
import { getProjectStore } from "@/lib/project-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ManagerNextBody = {
  managerAgentId?: string;
};

function bearerTokenFrom(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  return scheme?.toLowerCase() === "bearer" ? token?.trim() ?? "" : "";
}

function tokensMatch(receivedToken: string, expectedToken: string): boolean {
  const received = Buffer.from(receivedToken);
  const expected = Buffer.from(expectedToken);

  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const project = await getProjectStore().getProject(projectId);

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (!project.managerAgent.accessToken) {
    return NextResponse.json({ error: "Manager token must be rotated before use." }, { status: 409 });
  }

  if (!tokensMatch(bearerTokenFrom(request), project.managerAgent.accessToken)) {
    return NextResponse.json({ error: "Manager bearer token is required." }, { status: 401 });
  }

  let body: ManagerNextBody = {};

  try {
    body = (await request.json()) as ManagerNextBody;
  } catch {
    return NextResponse.json({ error: "A JSON body is required." }, { status: 400 });
  }

  if (body.managerAgentId !== project.managerAgent.id) {
    return NextResponse.json({ error: "Manager agent id does not match this project." }, { status: 403 });
  }

  const store = getProjectStore();
  let nextProject = await store.markStaleManagerCyclesForProject(project.id);
  const activeCycles = getActiveManagerCycles(nextProject);

  if (activeCycles.length > 0) {
    const activeCycle = activeCycles[0];

    return NextResponse.json({
      projectId: nextProject.id,
      decision: "wait",
      reason: "active_cycle_exists",
      selectedStageId: null,
      selectedStageName: null,
      cycleId: activeCycle.id,
      taskKey: activeCycle.taskKey,
      taskTitle: activeCycle.taskTitle,
      taskUrl: activeCycle.taskUrl,
      generatedAt: new Date().toISOString(),
      prompt: [
        `Project "${nextProject.title}" already has an active manager cycle (${activeCycle.id}).`,
        "Do not dispatch another worker. Observe the active cycle or wait for it to report back.",
      ].join("\n"),
    });
  }

  if (nextProject.repository) {
    try {
      const githubConnection = await getAuthStore().getGitHubConnection(nextProject.ownerUserId);
      const accessToken = githubConnection?.accessToken ?? nextProject.repository.accessToken ?? "";
      const issues = await fetchGitHubIssues(nextProject.repository, accessToken);

      nextProject = await store.recordGitHubIssueSync(nextProject.id, issues);
    } catch (error) {
      const syncError = error instanceof Error ? error.message : "GitHub issue sync failed.";

      nextProject = await store.recordGitHubIssueSync(
        nextProject.id,
        nextProject.githubIssueCache.issues,
        syncError,
      );

      return NextResponse.json({
        projectId: nextProject.id,
        decision: "stop",
        reason: "github_sync_failed",
        selectedStageId: null,
        selectedStageName: null,
        cycleId: null,
        taskKey: null,
        taskTitle: null,
        taskUrl: null,
        generatedAt: new Date().toISOString(),
        prompt: [
          `Could not sync GitHub issues for "${nextProject.title}".`,
          syncError,
          "Do not dispatch work from cached GitHub labels. Stop this manager cycle and review the GitHub connection before requesting more work.",
        ].join("\n"),
      });
    }
  }

  const cycleId = randomUUID();
  const resourceCounts = workflowResourceCountsFromIssues(nextProject);
  const nextPrompt = buildManagerNextPrompt(nextProject, resourceCounts, cycleId);

  try {
    await store.startManagerCycle({
      cycleId,
      managerAgentId: nextProject.managerAgent.id,
      projectId: nextProject.id,
      stageId: nextPrompt.selectedStageId,
      stageName: nextPrompt.selectedStageName,
      taskKey: nextPrompt.taskKey,
      taskTitle: nextPrompt.taskTitle,
      taskUrl: nextPrompt.taskUrl,
      prompt: nextPrompt.prompt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Project already has an active manager cycle.") {
      const currentProject = await store.getProject(nextProject.id);
      const activeCycle = currentProject ? getActiveManagerCycles(currentProject)[0] : null;

      return NextResponse.json(
        {
          projectId: nextProject.id,
          decision: "wait",
          reason: "active_cycle_exists",
          selectedStageId: null,
          selectedStageName: null,
          cycleId: activeCycle?.id ?? null,
          taskKey: activeCycle?.taskKey ?? null,
          taskTitle: activeCycle?.taskTitle ?? null,
          taskUrl: activeCycle?.taskUrl ?? null,
          generatedAt: new Date().toISOString(),
          prompt: "Another manager cycle started first. Do not dispatch another worker.",
        },
        { status: 409 },
      );
    }

    throw error;
  }

  return NextResponse.json(nextPrompt);
}
