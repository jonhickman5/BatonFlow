import { NextResponse } from "next/server";
import { isValidAccountEmail, normalizeAccountEmail } from "@/lib/auth";
import { prisma } from "@/lib/db";
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

  const user = await prisma.userAccount.findUnique({
    where: { normalizedEmail },
    select: { id: true },
  });

  return NextResponse.json({ exists: Boolean(user) });
}
