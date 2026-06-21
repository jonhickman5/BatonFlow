import Link from "next/link";
import { SignedInHome } from "@/app/home-ui";
import {
  type GitHubRepositorySummary,
  sanitizeGitHubConnectionForClient,
  sanitizeWorkflowProjectForClient,
} from "@/lib/data-structures";
import { getAuthStore } from "@/lib/auth-store";
import { fetchGitHubRepositories, getGitHubOAuthConfig } from "@/lib/github";
import { getProjectStore } from "@/lib/project-store";
import { getCurrentUser } from "@/lib/session";

export function PublicLanding() {
  return (
    <main className="page-shell landing-shell">
      <header className="site-header">
        <Link href="/" className="brand-mark">
          BatonFlow
        </Link>
        <Link href="/sign-in" className="header-link">
          Sign in
        </Link>
      </header>

      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Manager-orchestrated local AI workflows</p>
        <h1 id="page-title">BatonFlow</h1>
        <p className="hero-copy">
          Configure manager-orchestrated local AI agent workflows while keeping
          authoritative project state in GitHub and source control.
        </p>
        <div className="hero-actions">
          <Link href="/sign-in" className="primary-button">
            Start with an account
          </Link>
        </div>
      </section>

      <section className="placeholder-band" aria-label="Product preview placeholder">
        <div>
          <p>Placeholder</p>
          <h2>Workflow canvas coming soon</h2>
        </div>
        <div className="preview-grid" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
    </main>
  );
}

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    return <PublicLanding />;
  }

  const projectStore = getProjectStore();
  await projectStore.markStaleManagerCyclesForOwner(user.id);
  const projects = await projectStore.listProjects(user.id);
  const githubConnection = await getAuthStore().getGitHubConnection(user.id);
  let githubRepositories: GitHubRepositorySummary[] = [];
  let githubRepositoryError: string | null = null;

  if (githubConnection) {
    try {
      githubRepositories = await fetchGitHubRepositories(githubConnection.accessToken);
    } catch (error) {
      githubRepositoryError =
        error instanceof Error ? error.message : "Could not load GitHub repositories.";
    }
  }

  return (
    <SignedInHome
      backendUrl={process.env.BATONFLOW_BACKEND_URL ?? "http://127.0.0.1:3000"}
      githubConnection={sanitizeGitHubConnectionForClient(githubConnection)}
      githubOAuthConfigured={Boolean(
        getGitHubOAuthConfig(process.env.BATONFLOW_BACKEND_URL ?? "http://127.0.0.1:3000"),
      )}
      githubRepositories={githubRepositories}
      githubRepositoryError={githubRepositoryError}
      projects={projects.map(sanitizeWorkflowProjectForClient)}
      user={{ displayName: user.displayName, email: user.email }}
    />
  );
}
