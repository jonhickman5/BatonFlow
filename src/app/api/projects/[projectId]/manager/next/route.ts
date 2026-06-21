import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { buildManagerNextPrompt } from "@/lib/data-structures";
import type { WorkflowResourceCounts } from "@/lib/data-structures";
import { getProjectStore } from "@/lib/project-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ManagerNextBody = {
  managerAgentId?: string;
  resourceCounts?: Record<string, unknown>;
};

function normalizeResourceCounts(rawCounts: Record<string, unknown> | undefined): WorkflowResourceCounts | null {
  if (!rawCounts || Array.isArray(rawCounts)) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(rawCounts).map(([key, value]) => {
      const numericValue = typeof value === "number" && Number.isFinite(value) ? value : 0;

      return [key, Math.max(0, Math.floor(numericValue))];
    }),
  );
}

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

  const resourceCounts = normalizeResourceCounts(body.resourceCounts);

  if (!resourceCounts) {
    return NextResponse.json({ error: "resourceCounts are required." }, { status: 400 });
  }

  return NextResponse.json(buildManagerNextPrompt(project, resourceCounts));
}
