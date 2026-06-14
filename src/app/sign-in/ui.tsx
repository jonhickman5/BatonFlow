"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { createAccountAction, signInAction } from "@/app/actions";

type AuthState = {
  error?: string;
};

const initialState: AuthState = {};

export function AuthPanel() {
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailExists, setEmailExists] = useState(false);
  const [emailCheckPending, setEmailCheckPending] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [signInState, signInFormAction] = useActionState(signInAction, initialState);
  const [createState, createFormAction] = useActionState(createAccountAction, initialState);
  const passwordMismatch = confirmTouched && confirmPassword.length > 0 && password !== confirmPassword;
  const normalizedEmail = email.trim().toLowerCase();
  const shouldCheckEmail = mode === "create" && emailTouched && normalizedEmail.includes("@");
  const visibleDisplayName = displayNameTouched ? displayName : email;
  const visibleEmailExists = shouldCheckEmail && emailExists;
  const visibleEmailCheckPending = shouldCheckEmail && emailCheckPending;

  useEffect(() => {
    if (!shouldCheckEmail) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setEmailCheckPending(true);

      try {
        const response = await fetch(
          `/api/users/email-exists?email=${encodeURIComponent(normalizedEmail)}`,
          { signal: controller.signal },
        );
        const data = (await response.json()) as { exists?: boolean };

        setEmailExists(Boolean(data.exists));
      } catch {
        if (!controller.signal.aborted) {
          setEmailExists(false);
        }
      } finally {
        if (!controller.signal.aborted) {
          setEmailCheckPending(false);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [normalizedEmail, shouldCheckEmail]);

  function switchMode(nextMode: "sign-in" | "create") {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setConfirmTouched(false);
    setEmailExists(false);
    setEmailCheckPending(false);
    setEmailTouched(false);
  }

  return (
    <main className="page-shell auth-shell">
      <header className="site-header">
        <Link href="/" className="brand-mark">
          BatonFlow
        </Link>
        <Link href="/" className="header-link">
          Home
        </Link>
      </header>

      <section className="auth-layout">
        <div className="auth-copy">
          <p className="eyebrow">Access score</p>
          <h1>{mode === "sign-in" ? "Sign in to BatonFlow." : "Create your BatonFlow account."}</h1>
          <p>
            Set the tempo for local agent handoffs with an account surface that feels steady,
            focused, and ready for real teams.
          </p>
          <div className="rhythm-panel" aria-hidden="true">
            <div className="staff-lines">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="baton-mark" />
            <div className="rhythm-cues">
              <span>01</span>
              <span>Arrange</span>
              <span>Conduct</span>
              <span>Resolve</span>
            </div>
          </div>
        </div>

        <div className="auth-card">
          <div className="segmented-control" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "sign-in"}
              onClick={() => switchMode("sign-in")}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "create"}
              onClick={() => switchMode("create")}
            >
              Create account
            </button>
          </div>

          {mode === "sign-in" ? (
            <form action={signInFormAction} className="form-stack" key="sign-in-form">
              <label>
                <span>Email</span>
                <input
                  name="email"
                  type="email"
                  autoCapitalize="none"
                  autoComplete="email"
                  spellCheck={false}
                  required
                />
              </label>
              <label>
                <span>Password</span>
                <input name="password" type="password" autoComplete="current-password" required />
              </label>
              {signInState.error ? <p className="form-error">{signInState.error}</p> : null}
              <button type="submit" className="primary-button full-width">
                Sign in
              </button>
            </form>
          ) : (
            <form action={createFormAction} className="form-stack" key="create-account-form">
              <label>
                <span>Email</span>
                <input
                  name="email"
                  type="email"
                  autoCapitalize="none"
                  autoComplete="email"
                  spellCheck={false}
                  value={email}
                  onBlur={() => setEmailTouched(true)}
                  onChange={(event) => {
                    setEmailTouched(true);
                    setEmail(event.target.value);
                  }}
                  aria-invalid={visibleEmailExists}
                  aria-describedby={visibleEmailExists ? "email-exists-error" : undefined}
                  required
                />
              </label>
              {visibleEmailExists ? (
                <p className="form-error live-error" id="email-exists-error">
                  An account with this email already exists.
                </p>
              ) : null}
              <label>
                <span>Display name</span>
                <input
                  name="displayName"
                  autoComplete="name"
                  value={visibleDisplayName}
                  onChange={(event) => {
                    setDisplayNameTouched(true);
                    setDisplayName(event.target.value);
                  }}
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              <label>
                <span>Confirm password</span>
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onBlur={() => setConfirmTouched(true)}
                  onChange={(event) => {
                    setConfirmTouched(true);
                    setConfirmPassword(event.target.value);
                  }}
                  aria-invalid={passwordMismatch}
                  aria-describedby={passwordMismatch ? "password-match-error" : undefined}
                  required
                />
              </label>
              {passwordMismatch ? (
                <p className="form-error live-error" id="password-match-error">
                  Passwords do not match.
                </p>
              ) : null}
              {createState.error ? <p className="form-error">{createState.error}</p> : null}
              <button
                type="submit"
                className="primary-button full-width"
                disabled={passwordMismatch || visibleEmailExists || visibleEmailCheckPending}
              >
                Create account
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
