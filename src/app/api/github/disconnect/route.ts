import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAuthStore } from "@/lib/auth-store";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const origin = new URL(request.url).origin;

  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }

  await getAuthStore().deleteGitHubConnection(user.id);
  revalidatePath("/");

  return NextResponse.redirect(new URL("/?github=disconnected", origin));
}
