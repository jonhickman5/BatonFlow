import { NextResponse } from "next/server";
import { isValidAccountEmail, normalizeAccountEmail } from "@/lib/auth";
import { AuthStoreUnavailableError, getAuthStore } from "@/lib/auth-store";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const normalizedEmail = normalizeAccountEmail(searchParams.get("email") ?? "");

  if (!normalizedEmail || !isValidAccountEmail(normalizedEmail)) {
    return NextResponse.json({ exists: false });
  }

  const requester = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

  if (!checkRateLimit(`email-exists:${requester}:${normalizedEmail}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  try {
    const user = await getAuthStore().findUserByNormalizedEmail(normalizedEmail);

    return NextResponse.json({ exists: Boolean(user) });
  } catch (error) {
    if (error instanceof AuthStoreUnavailableError) {
      return NextResponse.json({ exists: false, unavailable: true });
    }

    throw error;
  }
}
