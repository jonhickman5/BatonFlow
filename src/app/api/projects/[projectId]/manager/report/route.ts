import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { WorkflowAgentRun, WorkflowManagerCycleStatus } from "@/lib/data-structures";
import { getProjectStore } from "@/lib/project-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ManagerReportBody = {
  managerAgentId?: string;
  cycleId?: string;
  status?: WorkflowManagerCycleStatus;
  terminalSummary?: string | null;
  stepCount?: number;
  agents?: Array<Partial<WorkflowAgentRun> & { name?: string }>;
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

function normalizeStatus(status: unknown): WorkflowManagerCycleStatus {
  return ["running", "completed", "failed", "blocked", "stale", "cancelled", "skipped"].includes(
    String(status),
  )
    ? (status as WorkflowManagerCycleStatus)
    : "running";
}

function normalizeStepCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const store = getProjectStore();
  const project = await store.getProject(projectId);

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (!project.managerAgent.accessToken) {
    return NextResponse.json({ error: "Manager token must be rotated before use." }, { status: 409 });
  }

  if (!tokensMatch(bearerTokenFrom(request), project.managerAgent.accessToken)) {
    return NextResponse.json({ error: "Manager bearer token is required." }, { status: 401 });
  }

  const currentProject = await store.markStaleManagerCyclesForProject(project.id);

  let body: ManagerReportBody = {};

  try {
    body = (await request.json()) as ManagerReportBody;
  } catch {
    return NextResponse.json({ error: "A JSON body is required." }, { status: 400 });
  }

  if (body.managerAgentId !== currentProject.managerAgent.id) {
    return NextResponse.json({ error: "Manager agent id does not match this project." }, { status: 403 });
  }

  if (!body.cycleId) {
    return NextResponse.json({ error: "cycleId is required." }, { status: 400 });
  }

  try {
    const updatedProject = await store.recordManagerReport({
      projectId: project.id,
      managerAgentId: currentProject.managerAgent.id,
      cycleId: body.cycleId,
      status: normalizeStatus(body.status),
      terminalSummary: typeof body.terminalSummary === "string" ? body.terminalSummary : null,
      stepCount: normalizeStepCount(body.stepCount),
      agents: (body.agents ?? []).map((agent) => ({
        ...agent,
        name: agent.name ?? "Subagent",
      })),
    });

    return NextResponse.json({
      projectId: updatedProject.id,
      cycleId: body.cycleId,
      recorded: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not record manager report." },
      { status: 400 },
    );
  }
}
