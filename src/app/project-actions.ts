"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProjectStore } from "@/lib/project-store";
import type { GitHubRepositoryInput, WorkflowProjectSettingsInput, WorkflowStageInput } from "@/lib/project-store";
import { getCurrentUser } from "@/lib/session";

export type ProjectActionState = {
  error?: string;
  message?: string;
};

type WorkflowConfigPayload = {
  globalInstructionsMarkdown?: string;
  stages?: WorkflowStageInput[];
};

function valueFrom(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parseWorkflowConfig(formData: FormData): WorkflowConfigPayload {
  const rawConfig = String(formData.get("workflowConfig") ?? "");

  if (!rawConfig) {
    throw new Error("Workflow configuration is required.");
  }

  const parsedConfig = JSON.parse(rawConfig) as WorkflowConfigPayload;

  if (!Array.isArray(parsedConfig.stages) || parsedConfig.stages.length === 0) {
    throw new Error("Add at least one workflow stage.");
  }

  return parsedConfig;
}

function numberFrom(formData: FormData, key: string, fallback: number) {
  const value = Number.parseInt(valueFrom(formData, key), 10);

  return Number.isFinite(value) ? value : fallback;
}

function repositoryFrom(formData: FormData): GitHubRepositoryInput | null {
  const owner = valueFrom(formData, "repositoryOwner");
  const name = valueFrom(formData, "repositoryName");
  const accessToken = valueFrom(formData, "repositoryAccessToken");
  const defaultBranch = valueFrom(formData, "repositoryDefaultBranch") || "main";

  if (!owner && !name && !accessToken) {
    return null;
  }

  return {
    owner,
    name,
    accessToken,
    defaultBranch,
  };
}

function settingsFrom(formData: FormData): WorkflowProjectSettingsInput {
  return {
    maxTaskSteps: numberFrom(formData, "maxTaskSteps", 20),
    staleAgentMinutes: numberFrom(formData, "staleAgentMinutes", 90),
  };
}

export async function createWorkflowProjectAction(
  _previousState: ProjectActionState,
  formData: FormData,
) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  try {
    const config = parseWorkflowConfig(formData);

    await getProjectStore().createProject({
      ownerUserId: user.id,
      title: valueFrom(formData, "title"),
      objective: valueFrom(formData, "objective"),
      globalInstructionsMarkdown: config.globalInstructionsMarkdown ?? "",
      repository: repositoryFrom(formData),
      settings: settingsFrom(formData),
      stages: config.stages ?? [],
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not create the project.",
    };
  }

  revalidatePath("/");
  return { message: "Project created." };
}

export async function updateWorkflowProjectAction(
  _previousState: ProjectActionState,
  formData: FormData,
) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  try {
    const config = parseWorkflowConfig(formData);

    await getProjectStore().updateProject({
      ownerUserId: user.id,
      projectId: valueFrom(formData, "projectId"),
      title: valueFrom(formData, "title"),
      objective: valueFrom(formData, "objective"),
      globalInstructionsMarkdown: config.globalInstructionsMarkdown ?? "",
      repository: repositoryFrom(formData),
      settings: settingsFrom(formData),
      stages: config.stages ?? [],
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not save the project.",
    };
  }

  revalidatePath("/");
  return { message: "Project saved." };
}

export async function rotateManagerAccessTokenAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  await getProjectStore().rotateManagerAccessToken(user.id, valueFrom(formData, "projectId"));
  revalidatePath("/");
}
