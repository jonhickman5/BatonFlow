import { NextResponse } from "next/server";
import { getAuthStore } from "@/lib/auth-store";
import { fetchGitHubRepositories } from "@/lib/github";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }

  const connection = await getAuthStore().getGitHubConnection(user.id);

  if (!connection) {
    return NextResponse.json({ error: "Connect GitHub before listing repositories." }, { status: 409 });
  }

  try {
    const repositories = await fetchGitHubRepositories(connection.accessToken);

    return NextResponse.json({ repositories });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load GitHub repositories." },
      { status: 502 },
    );
  }
}
