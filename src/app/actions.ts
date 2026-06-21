"use server";

import { redirect } from "next/navigation";
import { isValidAccountEmail, normalizeAccountEmail } from "@/lib/auth";
import {
  AuthStoreUnavailableError,
  DuplicateAccountEmailError,
  getAuthStore,
} from "@/lib/auth-store";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { checkRateLimit } from "@/lib/rate-limit";
import { clearSession, createSession } from "@/lib/session";

type AuthState = {
  error?: string;
};

function valueFrom(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

const AUTH_STORE_UNAVAILABLE_MESSAGE =
  "Account storage is unavailable. Check the local auth store or database connection and try again.";

export async function createAccountAction(_previousState: AuthState, formData: FormData) {
  const email = valueFrom(formData, "email");
  const normalizedEmail = normalizeAccountEmail(email);
  const displayName = valueFrom(formData, "displayName") || normalizedEmail;
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!normalizedEmail || !password) {
    return { error: "Email and password are required." };
  }

  if (!isValidAccountEmail(normalizedEmail)) {
    return { error: "Enter a valid email address." };
  }

  if (!checkRateLimit(`create-account:${normalizedEmail}`, 5, 10 * 60 * 1000)) {
    return { error: "Too many account creation attempts. Try again later." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  try {
    const authStore = getAuthStore();
    const existingUser = await authStore.findUserByNormalizedEmail(normalizedEmail);

    if (existingUser) {
      return { error: "That email is already in use." };
    }

    const user = await authStore.createUser({
      email,
      normalizedEmail,
      displayName,
      passwordHash: await hashPassword(password),
      emailVerificationStatus: "unverified",
    });

    await createSession(user.id);
  } catch (error) {
    if (error instanceof DuplicateAccountEmailError) {
      return { error: "That email is already in use." };
    }

    if (error instanceof AuthStoreUnavailableError) {
      return { error: AUTH_STORE_UNAVAILABLE_MESSAGE };
    }

    throw error;
  }

  redirect("/");
}

export async function signInAction(_previousState: AuthState, formData: FormData) {
  const normalizedEmail = normalizeAccountEmail(valueFrom(formData, "email"));
  const password = String(formData.get("password") ?? "");

  if (!normalizedEmail || !password) {
    return { error: "Email and password are required." };
  }

  if (!isValidAccountEmail(normalizedEmail)) {
    return { error: "Enter a valid email address." };
  }

  if (!checkRateLimit(`sign-in:${normalizedEmail}`, 10, 10 * 60 * 1000)) {
    return { error: "Too many sign-in attempts. Try again later." };
  }

  try {
    const user = await getAuthStore().findUserByNormalizedEmail(normalizedEmail);

    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return { error: "Invalid email or password." };
    }

    await createSession(user.id);
  } catch (error) {
    if (error instanceof AuthStoreUnavailableError) {
      return { error: AUTH_STORE_UNAVAILABLE_MESSAGE };
    }

    throw error;
  }

  redirect("/");
}

export async function signOutAction() {
  await clearSession();
  redirect("/");
}
