import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { AuthStoreUnavailableError, getAuthStore } from "@/lib/auth-store";

const SESSION_COOKIE = "batonflow_session";
const SESSION_DAYS = 30;

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await getAuthStore().createSession({
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  let session;

  try {
    session = await getAuthStore().findSessionByTokenHash(hashSessionToken(token));
  } catch (error) {
    if (error instanceof AuthStoreUnavailableError) {
      return null;
    }

    throw error;
  }

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session.user;
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    try {
      await getAuthStore().deleteSessionByTokenHash(hashSessionToken(token));
    } catch (error) {
      if (!(error instanceof AuthStoreUnavailableError)) {
        throw error;
      }
    }
  }

  cookieStore.delete(SESSION_COOKIE);
}
