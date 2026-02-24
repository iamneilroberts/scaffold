export function adminPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Watch Recommender</title>
  <style>
    :root {
      --bg-primary: #ffffff;
      --bg-secondary: #f5f5f5;
      --bg-card: #ffffff;
      --text-primary: #1a1a1a;
      --text-secondary: #666666;
      --accent: #5a52d5;
      --accent-hover: #4a44b5;
      --border: #e0e0e0;
      --priority-high: #d32f2f;
      --priority-medium: #f9a825;
      --priority-low: #9e9e9e;
      --input-bg: #f5f5f5;
      --input-border: #ddd;
      --tag-bg: #e8e6ff;
      --tag-text: #5a52d5;
      --success-bg: #e8f5e9;
      --success-text: #2e7d32;
      --error-bg: #ffebee;
      --error-text: #c62828;
      --danger: #d32f2f;
      --danger-hover: #b71c1c;
    }
    [data-theme="dark"] {
      --bg-primary: #0f0f0f;
      --bg-secondary: #1a1a2e;
      --bg-card: #1a1a2e;
      --text-primary: #e0e0e0;
      --text-secondary: #888888;
      --accent: #6c63ff;
      --accent-hover: #5a52e0;
      --border: #2a2a3e;
      --priority-high: #ff5252;
      --priority-medium: #ffd740;
      --priority-low: #757575;
      --input-bg: #2a2a3e;
      --input-border: #3a3a4e;
      --tag-bg: #2a2755;
      --tag-text: #9d97ff;
      --success-bg: #1a3a1a;
      --success-text: #4ade80;
      --error-bg: #3a1a1a;
      --error-text: #f87171;
      --danger: #e74c3c;
      --danger-hover: #c0392b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg-primary); color: var(--text-primary); }
    .header { background: var(--bg-secondary); padding: 1rem 2rem; display: flex; align-items: center; gap: 1rem; }
    .header h1 { font-size: 1.25rem; color: #fff; }
    .tabs { display: flex; gap: 0; border-bottom: 2px solid var(--border); padding: 0 2rem; background: var(--bg-secondary); }
    .tab { padding: 0.75rem 1.5rem; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; color: var(--text-secondary); }
    .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
    .tab:hover { color: #fff; }
    .content { padding: 2rem; max-width: 900px; }
    .card { background: var(--bg-card); border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem; }
    input, textarea, select { background: var(--input-bg); border: 1px solid var(--input-border); color: var(--text-primary); padding: 0.5rem; border-radius: 4px; width: 100%; }
    button { background: var(--accent); color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
    button:hover { background: var(--accent-hover); }
    button.danger { background: var(--danger); }
    .watch-item { display: flex; gap: 1rem; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid var(--border); }
    .watch-item img { width: 45px; height: 67px; border-radius: 4px; object-fit: cover; background: var(--input-bg); }
    .watch-item .info { flex: 1; }
    .watch-item .title { font-weight: 600; }
    .watch-item .meta { font-size: 0.85rem; color: var(--text-secondary); }
    .pref-item { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; }
    .status { padding: 1rem; border-radius: 4px; margin-bottom: 1rem; }
    .status.success { background: var(--success-bg); color: var(--success-text); }
    .status.error { background: var(--error-bg); color: var(--error-text); }
    .hidden { display: none; }
    .loading { opacity: 0.5; pointer-events: none; }
    .services-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.5rem 0; }
    .services-grid label { display: flex; align-items: center; gap: 0.25rem; padding: 0.25rem 0.5rem; background: var(--input-bg); border-radius: 4px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Watch Recommender</h1>
    <button id="theme-toggle" onclick="toggleTheme()" style="background:none; border:none; cursor:pointer; font-size:1.4rem; padding:8px; margin-left:auto;" aria-label="Toggle theme"></button>
  </div>
  <div class="tabs">
    <div class="tab active" data-tab="import">Import</div>
    <div class="tab" data-tab="history">History</div>
    <div class="tab" data-tab="preferences">Preferences</div>
  </div>

  <div class="content" id="tab-import">
    <div class="card">
      <h3>Import Watch History</h3>
      <p style="color:var(--text-secondary); margin: 0.5rem 0">Netflix: Account > Profile > Viewing Activity > Download</p>
      <input type="file" id="csv-file" accept=".csv" style="margin: 1rem 0">
      <button id="import-btn" onclick="importCsv()">Import CSV</button>
      <div id="import-progress" class="hidden" style="margin-top:1rem">
        <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem">
          <span id="progress-label">Importing...</span>
          <span id="progress-pct">0%</span>
        </div>
        <div style="background:var(--input-bg); border-radius:4px; height:8px; overflow:hidden">
          <div id="progress-bar" style="background:var(--accent); height:100%; width:0%; transition:width 0.3s"></div>
        </div>
      </div>
      <div id="import-status" class="hidden"></div>
    </div>
  </div>

  <div class="content hidden" id="tab-history">
    <div class="card">
      <input type="text" id="history-search" placeholder="Search titles..." oninput="filterHistory()">
    </div>
    <div id="history-list"></div>
  </div>

  <div class="content hidden" id="tab-preferences">
    <div class="card">
      <h3>Preference Statements</h3>
      <div id="pref-list"></div>
      <div style="display:flex; gap:0.5rem; margin-top:1rem">
        <input type="text" id="new-pref" placeholder="e.g. I don't like horror except psychological horror">
        <button onclick="addPreference()">Add</button>
      </div>
    </div>
    <div class="card" style="margin-top:1rem">
      <h3>Streaming Services</h3>
      <div class="services-grid" id="services-grid"></div>
      <button onclick="saveServices()" style="margin-top:0.5rem">Save</button>
    </div>
    <div class="card" style="margin-top:1rem">
      <h3>Taste Profile</h3>
      <div id="taste-profile">Loading...</div>
    </div>
  </div>

  <script>
    (function initTheme() {
      const saved = localStorage.getItem('watch-theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const theme = saved || (prefersDark ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', theme);
      const btn = document.getElementById('theme-toggle');
      if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    })();

    function toggleTheme() {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('watch-theme', next);
      const btn = document.getElementById('theme-toggle');
      if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
    }

    const SERVICES = ['Netflix','Amazon Prime Video','Hulu','Disney+','HBO Max','Apple TV+','Peacock','Paramount+','Crunchyroll','YouTube Premium'];
    let token = new URLSearchParams(location.search).get('token') || localStorage.getItem('watch-token') || '';
    if (token) localStorage.setItem('watch-token', token);
    if (!token) token = prompt('Enter your auth token:') || '';
    if (token) localStorage.setItem('watch-token', token);

    async function callTool(name, args) {
      const res = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args, _meta: { authKey: token } } }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.result;
    }

    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.content').forEach(c => c.classList.add('hidden'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.remove('hidden');
        if (tab.dataset.tab === 'history') loadHistory();
        if (tab.dataset.tab === 'preferences') loadPreferences();
      });
    });

    // Auto-select tab from URL hash
    if (location.hash === '#import') {
      document.querySelector('[data-tab="import"]').click();
    }

    // Import (chunked)
    async function importCsv() {
      const fileInput = document.getElementById('csv-file');
      const file = fileInput.files[0];
      if (!file) return;
      const csv = await file.text();
      const lines = csv.split('\\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { alert('CSV appears empty'); return; }

      const header = lines[0];
      const dataLines = lines.slice(1);
      const CHUNK_SIZE = 50;
      const chunks = [];
      for (let i = 0; i < dataLines.length; i += CHUNK_SIZE) {
        chunks.push(dataLines.slice(i, i + CHUNK_SIZE));
      }

      const btn = document.getElementById('import-btn');
      const progress = document.getElementById('import-progress');
      const progressBar = document.getElementById('progress-bar');
      const progressLabel = document.getElementById('progress-label');
      const progressPct = document.getElementById('progress-pct');
      const status = document.getElementById('import-status');

      btn.disabled = true;
      progress.classList.remove('hidden');
      status.classList.add('hidden');

      let totalImported = 0, totalSkipped = 0, totalFailed = 0;

      for (let i = 0; i < chunks.length; i++) {
        const chunkCsv = header + '\\n' + chunks[i].join('\\n');
        const pct = Math.round(((i + 1) / chunks.length) * 100);
        progressLabel.textContent = 'Chunk ' + (i + 1) + ' of ' + chunks.length + '...';
        progressPct.textContent = pct + '%';
        progressBar.style.width = pct + '%';

        try {
          const result = await callTool('watch-import', { csv: chunkCsv, source: 'netflix' });
          const text = result.content[0].text;
          const impMatch = text.match(/(\\d+) titles imported/);
          const skipMatch = text.match(/(\\d+) skipped/);
          const failMatch = text.match(/(\\d+) failed/);
          if (impMatch) totalImported += parseInt(impMatch[1]);
          if (skipMatch) totalSkipped += parseInt(skipMatch[1]);
          if (failMatch) totalFailed += parseInt(failMatch[1]);
        } catch (e) {
          totalFailed += chunks[i].length;
        }
      }

      progressBar.style.width = '100%';
      progressLabel.textContent = 'Done!';
      progressPct.textContent = '100%';
      btn.disabled = false;

      const parts = [totalImported + ' titles imported'];
      if (totalSkipped > 0) parts.push(totalSkipped + ' skipped');
      if (totalFailed > 0) parts.push(totalFailed + ' failed');

      status.className = 'status success';
      status.innerHTML = '<strong>' + parts.join(', ') + '</strong><br><span style="color:var(--text-secondary);margin-top:0.5rem;display:block">You can now return to Claude to continue setup.</span>';
      status.classList.remove('hidden');
    }

    // History
    let allHistory = [];
    async function loadHistory() {
      const list = document.getElementById('history-list');
      list.innerHTML = '<div class="card">Loading...</div>';
      try {
        const result = await callTool('watch-recommend', { mood: '_admin_list' });
        list.innerHTML = '<div class="card" style="color:var(--text-secondary)">View your full history via Claude chat. The admin page is optimized for imports and preference management.</div>';
      } catch (e) {
        list.innerHTML = '<div class="card status error">' + e.message + '</div>';
      }
    }

    // Preferences
    async function loadPreferences() {
      try {
        const result = await callTool('watch-preference', { action: 'list' });
        const text = result.content[0].text;
        const prefList = document.getElementById('pref-list');
        const lines = text.split('\\n').filter(l => l.match(/^\\s+\\d+\\./));
        if (lines.length === 0) {
          prefList.innerHTML = '<p style="color:var(--text-secondary)">No preferences yet.</p>';
        } else {
          prefList.innerHTML = lines.map((l, i) => {
            const txt = l.replace(/^\\s+\\d+\\.\\s*/, '');
            return '<div class="pref-item"><span>' + txt + '</span><button class="danger" onclick="removePreference(' + i + ')">Remove</button></div>';
          }).join('');
        }
        const svcMatch = text.match(/Streaming Services:\\s*(.+)/);
        const currentSvcs = svcMatch ? svcMatch[1].split(',').map(s => s.trim()) : [];
        const grid = document.getElementById('services-grid');
        grid.innerHTML = SERVICES.map(s => '<label><input type="checkbox" value="' + s.toLowerCase() + '"' + (currentSvcs.includes(s.toLowerCase()) ? ' checked' : '') + '> ' + s + '</label>').join('');
        const profileResult = await callTool('watch-profile', { action: 'view' });
        document.getElementById('taste-profile').innerHTML = '<pre style="white-space:pre-wrap;color:var(--text-secondary)">' + profileResult.content[0].text + '</pre>';
      } catch (e) {
        console.error(e);
      }
    }

    async function addPreference() {
      const input = document.getElementById('new-pref');
      if (!input.value.trim()) return;
      await callTool('watch-preference', { action: 'add', statement: input.value.trim() });
      input.value = '';
      loadPreferences();
    }

    async function removePreference(index) {
      await callTool('watch-preference', { action: 'remove', index });
      loadPreferences();
    }

    async function saveServices() {
      const checked = [...document.querySelectorAll('#services-grid input:checked')].map(c => c.value);
      await callTool('watch-preference', { action: 'set-services', services: checked });
      loadPreferences();
    }

    function filterHistory() {
      // Placeholder for future search
    }
  </script>
</body>
</html>`;
}
