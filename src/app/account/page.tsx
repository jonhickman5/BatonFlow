import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/session";

export default async function AccountPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <main className="page-shell account-shell">
      <header className="site-header">
        <Link href="/" className="brand-mark">
          BatonFlow
        </Link>
        <form action={signOutAction}>
          <button type="submit" className="header-link button-link">
            Sign out
          </button>
        </form>
      </header>

      <section className="account-panel">
        <p className="eyebrow">Signed in</p>
        <h1>Account info</h1>
        <dl className="account-list">
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Display name</dt>
            <dd>{user.displayName}</dd>
          </div>
          <div>
            <dt>Email verification</dt>
            <dd>{user.emailVerificationStatus === "verified" ? "Confirmed" : "Unconfirmed"}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{user.createdAt.toLocaleString()}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
