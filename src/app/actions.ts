"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { isValidAccountEmail, normalizeAccountEmail } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { checkRateLimit } from "@/lib/rate-limit";
import { clearSession, createSession } from "@/lib/session";

type AuthState = {
  error?: string;
};

function valueFrom(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

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

  const existingUser = await prisma.userAccount.findUnique({ where: { normalizedEmail } });

  if (existingUser) {
    return { error: "That email is already in use." };
  }

  try {
    const user = await prisma.userAccount.create({
      data: {
        email,
        normalizedEmail,
        displayName,
        passwordHash: await hashPassword(password),
        emailVerificationStatus: "unverified",
      },
    });

    await createSession(user.id);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { error: "That email is already in use." };
    }

    throw error;
  }

  redirect("/account");
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

  const user = await prisma.userAccount.findUnique({ where: { normalizedEmail } });

  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Invalid email or password." };
  }

  await createSession(user.id);
  redirect("/account");
}

export async function signOutAction() {
  await clearSession();
  redirect("/");
}
