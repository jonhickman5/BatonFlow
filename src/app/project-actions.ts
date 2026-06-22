"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthStore } from "@/lib/auth-store";
import { fetchGitHubRepositories } from "@/lib/github";
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

async function repositoryFrom(
  formData: FormData,
  userId: string,
): Promise<GitHubRepositoryInput | null | undefined> {
  if (!formData.has("repositoryFullName")) {
    return undefined;
  }

  const repositoryFullName = valueFrom(formData, "repositoryFullName");

  if (!repositoryFullName) {
    return null;
  }

  const connection = await getAuthStore().getGitHubConnection(userId);

  if (!connection) {
    throw new Error("Connect your GitHub account before attaching a repository.");
  }

  const repositories = await fetchGitHubRepositories(connection.accessToken);
  const selectedRepository = repositories.find((repository) => repository.fullName === repositoryFullName);

  if (!selectedRepository) {
    throw new Error("Select a repository from your connected GitHub account.");
  }

  return {
    githubRepositoryId: selectedRepository.id,
    owner: selectedRepository.owner,
    name: selectedRepository.name,
    fullName: selectedRepository.fullName,
    url: selectedRepository.url,
    defaultBranch: selectedRepository.defaultBranch,
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
      repository: await repositoryFrom(formData, user.id),
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
      repository: await repositoryFrom(formData, user.id),
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

export async function deleteWorkflowProjectAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  await getProjectStore().deleteProject(user.id, valueFrom(formData, "projectId"));
  revalidatePath("/");
}

export async function rotateManagerAccessTokenAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  await getProjectStore().rotateManagerAccessToken(user.id, valueFrom(formData, "projectId"));
  revalidatePath("/");
}
