export default function Home() {
  const structures = [
    {
      name: "Projects",
      detail: "Top-level workflow configuration with stages and a start stage.",
    },
    {
      name: "Stages",
      detail: "Agent roles with prompt IDs and valid handoff paths.",
    },
    {
      name: "Prompts",
      detail: "Manager, stage, north star, operations, and user-defined context.",
    },
    {
      name: "Project Updates",
      detail: "Lightweight status notes from local manager and stage runs.",
    },
  ];

  return (
    <main className="app-shell">
      <section className="masthead" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Workflow setup</p>
          <h1 id="page-title">BatonFlow</h1>
          <p className="summary">
            Configure manager-orchestrated local AI agent workflows while keeping
            authoritative project state in GitHub and source control.
          </p>
        </div>
        <div className="status-panel" aria-label="Initial setup status">
          <span className="status-dot" aria-hidden="true" />
          <span>Initial schema documented</span>
        </div>
      </section>

      <section className="content-grid" aria-label="Core data structures">
        {structures.map((structure) => (
          <article className="structure-card" key={structure.name}>
            <div className="card-icon" aria-hidden="true">
              {structure.name.charAt(0)}
            </div>
            <div>
              <h2>{structure.name}</h2>
              <p>{structure.detail}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="workflow-strip" aria-label="Source of truth">
        <span>Website stores configuration</span>
        <span>Local runner executes prompts</span>
        <span>GitHub/source control remains authoritative</span>
      </section>
    </main>
  );
}
