import './More.css';

const tools = [
  {
    name: 'Billing',
    description: 'Create invoices, record payments, manage collection goals, and monitor clinic collections.',
    badge: 'Clinic Operations',
    destination: 'Billing',
    icon: <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="8" y="6" width="27" height="36" rx="5" stroke="currentColor" strokeWidth="2.4"/><path d="M15 16h13M15 23h13M15 30h6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/><circle cx="35" cy="34" r="9" fill="#fff" stroke="currentColor" strokeWidth="2.4"/><path d="M35 29v10m-3.5-7h4.2a1.7 1.7 0 0 1 0 3.4h-4.2m0-1.7h3.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>,
  },
  {
    name: 'Reports',
    description: 'Review clinic performance, patient activity, treatment summaries, and financial analytics.',
    badge: 'Analytics',
    destination: 'Reports',
    icon: <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="6" y="7" width="36" height="34" rx="6" stroke="currentColor" strokeWidth="2.4"/><path d="M14 33V25m10 8V17m10 16V22" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"/><path d="M12 36h24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>,
  },
];

export default function More({ onNavigate }) {
  return <div className="content-page more-page">
    <div className="page-title-row">
      <div><h1>More</h1><p>Access additional clinic management tools and analytics.</p></div>
    </div>

    <section className="more-hero" aria-labelledby="more-hero-title">
      <span className="more-hero-icon" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M16 4.5v23M4.5 16h23M7.9 7.9l16.2 16.2m0-16.2L7.9 24.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="16" cy="16" r="5.5" fill="#fff" stroke="currentColor" strokeWidth="1.7"/></svg></span>
      <div><span className="more-eyebrow">CLINIC WORKSPACE</span><h2 id="more-hero-title">Additional Clinic Tools</h2><p>Manage billing operations and review clinic performance reports from one place.</p></div>
    </section>

    <section className="more-tools-grid" aria-label="Additional clinic tools">
      {tools.map(tool => <button key={tool.destination} className="more-tool-card" type="button" onClick={() => onNavigate(tool.destination)}>
        <span className={`more-tool-icon more-tool-icon-${tool.destination.toLowerCase()}`}>{tool.icon}</span>
        <span className="more-tool-content">
          <span className="more-tool-topline"><span className="more-tool-name">{tool.name}</span><span className="more-tool-badge">{tool.badge}</span></span>
          <span className="more-tool-description">{tool.description}</span>
          <span className="more-tool-action">Open {tool.name}<span aria-hidden="true">→</span></span>
        </span>
        <span className="more-tool-arrow" aria-hidden="true">↗</span>
      </button>)}
    </section>
  </div>;
}
