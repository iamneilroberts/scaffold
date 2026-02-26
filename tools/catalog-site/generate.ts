/**
 * Static site generator for the Scaffold App Catalog.
 *
 * Reads docs/catalog/catalog.json, renders HTML pages, writes to docs/catalog/.
 * Uses TypeScript string templates (no framework dependency).
 *
 * Run: npx tsx tools/catalog-site/generate.ts
 */

import fs from 'fs';
import path from 'path';

// --- Types ---

interface AppEntry {
  name: string;
  displayName: string;
  icon: string;
  version: string;
  category: string;
  tags: string[];
  description: string;
  cycleId: string;
  builtAt: string;
  sourceUrl: string;
  tools: { name: string; description: string }[];
  quality: {
    judgeScore: number | null;
    judgeVerdict: string | null;
    personaPassRate: number | null;
    buildIterations: number;
    guardianPassed: boolean | null;
    testCount: number;
  };
  install: {
    workerUrl: string;
    requiresAuth: boolean;
    requiresExternalAPI?: string;
    mcpConfig: Record<string, unknown>;
  };
  status: 'active' | 'beta' | 'deprecated';
}

interface Catalog {
  apps: AppEntry[];
  updatedAt: string | null;
}

// --- XSS Protection ---

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsonForScript(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

// --- Shared Styles ---

const STYLES = `
  :root {
    --bg: #0f0f0f;
    --bg-card: #1a1a2e;
    --bg-hover: #222240;
    --text: #e0e0e0;
    --text-muted: #888;
    --accent: #6c63ff;
    --accent-hover: #5a52e0;
    --border: #2a2a3e;
    --tag-bg: #2a2755;
    --tag-text: #9d97ff;
    --success: #4ade80;
    --warning: #fbbf24;
    --badge-active: #22c55e;
    --badge-beta: #f59e0b;
    --badge-deprecated: #ef4444;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  .header { padding: 2rem; text-align: center; border-bottom: 1px solid var(--border); }
  .header h1 { font-size: 2rem; margin-bottom: 0.25rem; }
  .header p { color: var(--text-muted); }

  .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }

  .controls { display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
  .search-input {
    flex: 1; min-width: 200px; padding: 0.75rem 1rem;
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
    color: var(--text); font-size: 1rem; outline: none;
  }
  .search-input:focus { border-color: var(--accent); }
  .filter-btn {
    padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid var(--border);
    background: var(--bg-card); color: var(--text-muted); cursor: pointer; font-size: 0.875rem;
    transition: all 0.15s;
  }
  .filter-btn:hover, .filter-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 1.5rem; }
  .card {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px;
    padding: 1.5rem; transition: border-color 0.15s; cursor: pointer; text-decoration: none; color: inherit; display: block;
  }
  .card:hover { border-color: var(--accent); text-decoration: none; }
  .card-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
  .card-icon { font-size: 2rem; }
  .card-title { font-size: 1.125rem; font-weight: 600; }
  .card-desc { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem; }
  .card-meta { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
  .badge {
    display: inline-block; padding: 0.125rem 0.5rem; border-radius: 99px;
    font-size: 0.75rem; font-weight: 500;
  }
  .badge-active { background: rgba(34,197,94,0.15); color: var(--badge-active); }
  .badge-beta { background: rgba(245,158,11,0.15); color: var(--badge-beta); }
  .badge-deprecated { background: rgba(239,68,68,0.15); color: var(--badge-deprecated); }
  .tag { background: var(--tag-bg); color: var(--tag-text); padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.75rem; }
  .tool-count { color: var(--text-muted); font-size: 0.8rem; }

  .copy-btn {
    padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid var(--accent);
    background: transparent; color: var(--accent); cursor: pointer; font-size: 0.875rem;
    transition: all 0.15s;
  }
  .copy-btn:hover { background: var(--accent); color: #fff; }
  .copy-btn.copied { background: var(--success); border-color: var(--success); color: #000; }

  .detail-back { display: inline-block; margin-bottom: 1.5rem; color: var(--text-muted); }
  .detail-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
  .detail-icon { font-size: 3rem; }
  .detail-title { font-size: 1.75rem; font-weight: 700; }
  .detail-section { margin-bottom: 2rem; }
  .detail-section h2 { font-size: 1.125rem; margin-bottom: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; }
  .tool-list { list-style: none; }
  .tool-list li { padding: 0.5rem 0; border-bottom: 1px solid var(--border); }
  .tool-list li:last-child { border-bottom: none; }
  .tool-name { font-family: monospace; color: var(--accent); font-weight: 500; }
  .tool-desc { color: var(--text-muted); font-size: 0.9rem; margin-left: 0.5rem; }
  .quality-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; }
  .quality-item { background: var(--bg); padding: 1rem; border-radius: 8px; }
  .quality-label { font-size: 0.8rem; color: var(--text-muted); }
  .quality-value { font-size: 1.25rem; font-weight: 600; }
  .install-block { background: var(--bg); padding: 1rem; border-radius: 8px; overflow-x: auto; }
  .install-block pre { font-family: monospace; font-size: 0.875rem; white-space: pre-wrap; }

  .empty { text-align: center; padding: 4rem 2rem; color: var(--text-muted); }

  @media (max-width: 600px) {
    .container { padding: 1rem; }
    .grid { grid-template-columns: 1fr; }
  }
`;

// --- Homepage ---

function renderHomepage(catalog: Catalog): string {
  const categories = [...new Set(catalog.apps.map(a => a.category))].sort();

  const cards = catalog.apps.map(app => {
    const statusClass = `badge-${app.status}`;
    const tags = app.tags.slice(0, 3).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');

    return `<a class="card" href="apps/${escapeHtml(app.name)}/index.html" data-name="${escapeHtml(app.name)}" data-category="${escapeHtml(app.category)}" data-tags="${escapeHtml(app.tags.join(','))}" data-search="${escapeHtml([app.name, app.displayName, app.description, ...app.tags, ...app.tools.map(t => t.name)].join(' ').toLowerCase())}">
      <div class="card-header">
        <span class="card-icon">${escapeHtml(app.icon)}</span>
        <span class="card-title">${escapeHtml(app.displayName)}</span>
      </div>
      <div class="card-desc">${escapeHtml(app.description)}</div>
      <div class="card-meta">
        <span class="badge ${statusClass}">${escapeHtml(app.status)}</span>
        <span class="tool-count">${app.tools.length} tools</span>
        ${tags}
      </div>
    </a>`;
  }).join('\n');

  const filterBtns = categories.map(cat =>
    `<button class="filter-btn" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Scaffold App Catalog</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="header">
    <h1>Scaffold App Catalog</h1>
    <p>${catalog.apps.length} MCP tool apps built with the Scaffold framework</p>
  </div>
  <div class="container">
    <div class="controls">
      <input class="search-input" type="text" placeholder="Search apps..." id="search">
      <button class="filter-btn active" data-category="all">All</button>
      ${filterBtns}
    </div>
    <div class="grid" id="grid">
      ${cards}
    </div>
    <div class="empty" id="empty" style="display:none">No apps match your search.</div>
  </div>
  <script>
    const search = document.getElementById('search');
    const grid = document.getElementById('grid');
    const empty = document.getElementById('empty');
    const cards = grid.querySelectorAll('.card');
    const filterBtns = document.querySelectorAll('.filter-btn');
    let activeCategory = 'all';

    function filterCards() {
      const q = search.value.toLowerCase();
      let visible = 0;
      cards.forEach(card => {
        const matchSearch = !q || card.dataset.search.includes(q);
        const matchCat = activeCategory === 'all' || card.dataset.category === activeCategory;
        const show = matchSearch && matchCat;
        card.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      empty.style.display = visible === 0 ? '' : 'none';
    }

    search.addEventListener('input', filterCards);
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeCategory = btn.dataset.category;
        filterCards();
      });
    });
  </script>
</body>
</html>`;
}

// --- App Detail Page ---

function renderAppPage(app: AppEntry): string {
  const statusClass = `badge-${app.status}`;
  const tags = app.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join(' ');
  const mcpConfigJson = JSON.stringify(app.install.mcpConfig, null, 2);

  const tools = app.tools.map(t =>
    `<li><span class="tool-name">${escapeHtml(t.name)}</span><span class="tool-desc">${escapeHtml(t.description)}</span></li>`
  ).join('\n');

  const qualityItems: string[] = [];
  if (app.quality.judgeScore != null) {
    qualityItems.push(`<div class="quality-item"><div class="quality-label">Judge Score</div><div class="quality-value">${app.quality.judgeScore}/100</div></div>`);
  }
  if (app.quality.judgeVerdict) {
    qualityItems.push(`<div class="quality-item"><div class="quality-label">Verdict</div><div class="quality-value">${escapeHtml(app.quality.judgeVerdict)}</div></div>`);
  }
  if (app.quality.personaPassRate != null) {
    qualityItems.push(`<div class="quality-item"><div class="quality-label">Persona Pass Rate</div><div class="quality-value">${Math.round(app.quality.personaPassRate * 100)}%</div></div>`);
  }
  qualityItems.push(`<div class="quality-item"><div class="quality-label">Build Iterations</div><div class="quality-value">${app.quality.buildIterations}</div></div>`);
  if (app.quality.guardianPassed != null) {
    qualityItems.push(`<div class="quality-item"><div class="quality-label">Guardian</div><div class="quality-value">${app.quality.guardianPassed ? 'Passed' : 'Failed'}</div></div>`);
  }
  if (app.quality.testCount > 0) {
    qualityItems.push(`<div class="quality-item"><div class="quality-label">Tests</div><div class="quality-value">${app.quality.testCount}</div></div>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(app.displayName)} — Scaffold Catalog</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="container">
    <a href="../../index.html" class="detail-back">&larr; Back to catalog</a>

    <div class="detail-header">
      <span class="detail-icon">${escapeHtml(app.icon)}</span>
      <div>
        <div class="detail-title">${escapeHtml(app.displayName)}</div>
        <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.25rem;">
          <span class="badge ${statusClass}">${escapeHtml(app.status)}</span>
          <span style="color:var(--text-muted)">v${escapeHtml(app.version)}</span>
          ${tags}
        </div>
      </div>
    </div>

    <div class="detail-section">
      <p>${escapeHtml(app.description)}</p>
      <p style="margin-top:0.5rem;color:var(--text-muted)">
        Category: ${escapeHtml(app.category)} &middot;
        <a href="${escapeHtml(app.sourceUrl)}">Source code</a> &middot;
        Built: ${escapeHtml(app.builtAt.split('T')[0])}
      </p>
    </div>

    <div class="detail-section">
      <h2>Tools (${app.tools.length})</h2>
      <ul class="tool-list">
        ${tools}
      </ul>
    </div>

    <div class="detail-section">
      <h2>Quality</h2>
      <div class="quality-grid">
        ${qualityItems.join('\n')}
      </div>
    </div>

    <div class="detail-section">
      <h2>Install</h2>
      <p style="margin-bottom:0.75rem;color:var(--text-muted)">
        Add to Claude Desktop config:
        <button class="copy-btn" id="copy-btn">Copy MCP Config</button>
      </p>
      <div class="install-block">
        <pre id="mcp-config">${escapeHtml(mcpConfigJson)}</pre>
      </div>
      <p style="margin-top:0.75rem;color:var(--text-muted)">
        Worker: <code>${escapeHtml(app.install.workerUrl)}</code><br>
        ${app.install.requiresAuth ? 'Auth required — replace YOUR_TOKEN with your admin key.' : 'No auth required.'}
        ${app.install.requiresExternalAPI ? `<br>Requires: ${escapeHtml(app.install.requiresExternalAPI)}` : ''}
      </p>
    </div>
  </div>

  <script>
    const copyBtn = document.getElementById('copy-btn');
    const configEl = document.getElementById('mcp-config');
    copyBtn.addEventListener('click', async () => {
      const config = ${escapeJsonForScript(app.install.mcpConfig)};
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      setTimeout(() => { copyBtn.textContent = 'Copy MCP Config'; copyBtn.classList.remove('copied'); }, 2000);
    });
  </script>
</body>
</html>`;
}

// --- Main ---

function main() {
  const rootDir = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const catalogPath = path.join(rootDir, 'docs', 'catalog', 'catalog.json');
  const outputDir = path.join(rootDir, 'docs', 'catalog');

  console.log(`Reading catalog from ${catalogPath}`);
  const catalogRaw = fs.readFileSync(catalogPath, 'utf-8');
  const catalog: Catalog = JSON.parse(catalogRaw);

  console.log(`Found ${catalog.apps.length} apps`);

  // Generate homepage
  const homepage = renderHomepage(catalog);
  fs.writeFileSync(path.join(outputDir, 'index.html'), homepage);
  console.log(`  Written: index.html`);

  // Generate per-app pages
  for (const app of catalog.apps) {
    const appDir = path.join(outputDir, 'apps', app.name);
    fs.mkdirSync(appDir, { recursive: true });
    const page = renderAppPage(app);
    fs.writeFileSync(path.join(appDir, 'index.html'), page);
    console.log(`  Written: apps/${app.name}/index.html`);
  }

  console.log('Done!');
}

main();
