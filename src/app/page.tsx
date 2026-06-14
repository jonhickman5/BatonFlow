import Link from "next/link";

export default function Home() {
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
