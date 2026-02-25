export function adminPageHtml(tmdbKey?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${tmdbKey ? `<meta name="tmdb-key" content="${tmdbKey.replace(/"/g, '&quot;')}" />` : ''}
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

    @media (max-width: 639px) {
      #filter-bar { display: none; }
      .mobile-filter-toggle { display: block !important; }
      #filter-bar.show { display: flex !important; flex-direction: column; width: 100%; }
    }

    @media (min-width: 640px) and (max-width: 1023px) {
      #queue-list { grid-template-columns: repeat(2, 1fr); }
    }

    @media (min-width: 1024px) {
      #queue-list { grid-template-columns: repeat(3, 1fr); }
    }
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
    <div class="tab" data-tab="watchlist">Watchlist</div>
    <div class="tab" data-tab="settings">Settings</div>
    <div class="tab" data-tab="feedback">Feedback</div>
  </div>

  <div class="content" id="tab-import">
    <div class="card">
      <h3>Import Watch History</h3>
      <p style="color:var(--text-secondary); margin: 0.5rem 0">Netflix: Account > Profile > Viewing Activity > Download</p>
      <p style="color:var(--text-secondary); margin: 0.5rem 0; font-size:0.85rem;">
        Your file is parsed entirely in the browser — nothing is uploaded to the server.
      </p>
      <input type="file" id="csv-file" accept=".csv" style="margin: 1rem 0">
      <button id="import-btn" onclick="importCsv()">Import CSV</button>
      <div id="import-progress" class="hidden" style="margin-top:1rem">
        <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem">
          <span id="progress-label">Processing...</span>
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

  <div class="content hidden" id="tab-watchlist">
    <div id="queue-filters" style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap;">
      <button id="filter-toggle" class="mobile-filter-toggle" style="display:none; background:var(--accent); color:#fff; border:none; padding:8px 16px; border-radius:6px; cursor:pointer;">Filter</button>
      <div id="filter-bar" style="display:flex; gap:8px; flex-wrap:wrap;">
        <select id="filter-priority" style="padding:8px; border-radius:6px; border:1px solid var(--border); background:var(--input-bg); color:var(--text-primary);">
          <option value="">All Priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select id="filter-type" style="padding:8px; border-radius:6px; border:1px solid var(--border); background:var(--input-bg); color:var(--text-primary);">
          <option value="">All Types</option>
          <option value="movie">Movies</option>
          <option value="tv">TV Shows</option>
        </select>
        <input id="filter-tag" type="text" placeholder="Filter by tag..." style="padding:8px; border-radius:6px; border:1px solid var(--border); background:var(--input-bg); color:var(--text-primary); min-width:140px;" />
      </div>
    </div>
    <div id="queue-list" style="display:grid; gap:12px;"></div>
    <p id="queue-empty" style="display:none; color:var(--text-secondary); text-align:center; padding:40px 0;">Your watchlist is empty. Save titles to watch later using the watch-queue tool.</p>
  </div>

  <div class="content hidden" id="tab-settings">
    <div class="card">
      <h3>TMDB API Key</h3>
      <p style="color:var(--text-secondary); margin: 0.5rem 0; font-size:0.85rem;">
        Add your own free TMDB API key for unlimited lookups.
        <a href="https://www.themoviedb.org/signup" target="_blank" style="color:var(--accent);">Sign up at TMDB</a>,
        then go to Settings &gt; API and copy your Read Access Token.
      </p>
      <div style="display:flex; gap:0.5rem; margin-top:0.75rem;">
        <input type="text" id="tmdb-key-input" placeholder="Paste your TMDB Read Access Token">
        <button onclick="saveTmdbKey()">Save</button>
      </div>
      <div id="settings-key-status" class="hidden" style="margin-top:0.5rem;"></div>
    </div>
    <div class="card" style="margin-top:1rem">
      <h3>Usage</h3>
      <div id="settings-usage" style="color:var(--text-secondary)">Loading...</div>
    </div>
  </div>

  <div class="content hidden" id="tab-feedback">
    <div class="card" style="display:flex; align-items:center; gap:1rem;">
      <label for="feedback-status-filter" style="white-space:nowrap; font-weight:600;">Status:</label>
      <select id="feedback-status-filter" style="max-width:200px;">
        <option value="open">Open</option>
        <option value="resolved">Resolved</option>
        <option value="dismissed">Dismissed</option>
        <option value="all">All</option>
      </select>
    </div>
    <div id="feedback-list" style="display:grid; gap:12px; margin-top:1rem;"></div>
    <p id="feedback-empty" style="display:none; color:var(--text-secondary); text-align:center; padding:40px 0;">No feedback to show.</p>
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
        if (tab.dataset.tab === 'watchlist') loadQueue();
        if (tab.dataset.tab === 'settings') loadSettings();
        if (tab.dataset.tab === 'feedback') loadFeedback();
      });
    });

    // Auto-select tab from URL hash
    if (location.hash === '#import') {
      document.querySelector('[data-tab="import"]').click();
    }

    // Import — client-side CSV parsing + TMDB lookups
    function parseNetflixCsv(lines) {
      // Netflix CSV: "Title","Date" — skip header
      const seen = new Set();
      const titles = [];
      for (let i = 1; i < lines.length; i++) {
        const match = lines[i].match(/"([^"]+)"/);
        if (!match) continue;
        // Strip episode info: "Show: Season X: Episode Title" → "Show"
        const raw = match[1];
        const colonIdx = raw.indexOf(':');
        const title = colonIdx > 0 ? raw.substring(0, colonIdx).trim() : raw.trim();
        if (title && !seen.has(title.toLowerCase())) {
          seen.add(title.toLowerCase());
          titles.push(title);
        }
      }
      return titles;
    }

    async function importCsv() {
      const fileInput = document.getElementById('csv-file');
      const file = fileInput.files[0];
      if (!file) return;

      const tmdbKeyMeta = document.querySelector('meta[name="tmdb-key"]');
      const tmdbKey = tmdbKeyMeta ? tmdbKeyMeta.content : '';
      if (!tmdbKey) {
        alert('TMDB API key not configured. Set TMDB_API_KEY in your environment.');
        return;
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

      progressLabel.textContent = 'Reading file...';
      progressBar.style.width = '5%';
      progressPct.textContent = '5%';

      const csv = await file.text();
      const lines = csv.split('\\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        alert('CSV appears empty');
        btn.disabled = false;
        progress.classList.add('hidden');
        return;
      }

      const titles = parseNetflixCsv(lines);
      progressBar.style.width = '10%';
      progressPct.textContent = '10%';
      progressLabel.textContent = 'Found ' + titles.length + ' unique titles. Looking up on TMDB...';

      // TMDB lookups from browser
      const seenEntries = [];
      let lookupFailed = 0;

      for (let i = 0; i < titles.length; i++) {
        try {
          const res = await fetch(
            'https://api.themoviedb.org/3/search/multi?query=' + encodeURIComponent(titles[i]) + '&language=en-US&page=1',
            { headers: { Authorization: 'Bearer ' + tmdbKey, 'Content-Type': 'application/json' } }
          );
          if (res.ok) {
            const data = await res.json();
            const hit = (data.results || []).find(r => r.media_type === 'movie' || r.media_type === 'tv');
            if (hit) {
              seenEntries.push({
                tmdbId: hit.id,
                title: hit.title || hit.name,
                type: hit.media_type,
              });
            }
          } else {
            lookupFailed++;
          }
        } catch { lookupFailed++; }

        const pct = 10 + Math.round((i / titles.length) * 70);
        progressBar.style.width = pct + '%';
        progressPct.textContent = pct + '%';
        progressLabel.textContent = 'Looking up ' + (i + 1) + '/' + titles.length + '...';

        // Throttle to stay under TMDB rate limit (~40 req/10s)
        if ((i + 1) % 30 === 0) await new Promise(r => setTimeout(r, 1000));
      }

      progressBar.style.width = '85%';
      progressPct.textContent = '85%';
      progressLabel.textContent = 'Saving ' + seenEntries.length + ' titles...';

      // Send in batches of 50 via watch-seen-bulk
      let saveFailed = 0;
      for (let i = 0; i < seenEntries.length; i += 50) {
        const chunk = seenEntries.slice(i, i + 50);
        try {
          await callTool('watch-seen-bulk', { entries: chunk });
        } catch { saveFailed += chunk.length; }
      }

      progressBar.style.width = '95%';
      progressPct.textContent = '95%';
      progressLabel.textContent = 'Generating taste profile...';

      try {
        await callTool('watch-profile', { action: 'generate' });
      } catch { /* profile generation is optional */ }

      progressBar.style.width = '100%';
      progressPct.textContent = '100%';
      progressLabel.textContent = 'Done!';
      btn.disabled = false;

      const parts = [seenEntries.length + ' titles imported'];
      if (lookupFailed > 0) parts.push(lookupFailed + ' lookup failures');
      const notFound = titles.length - seenEntries.length - lookupFailed;
      if (notFound > 0) parts.push(notFound + ' not found on TMDB');
      if (saveFailed > 0) parts.push(saveFailed + ' failed to save');

      status.className = 'status success';
      status.innerHTML = '<strong>' + parts.join(', ') + '</strong><br><span style="color:var(--text-secondary);margin-top:0.5rem;display:block">Your seen history and taste profile have been updated. You can now return to Claude to continue.</span>';
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

    // Settings tab
    async function saveTmdbKey() {
      const input = document.getElementById('tmdb-key-input');
      const status = document.getElementById('settings-key-status');
      const key = input.value.trim();
      if (!key) return;
      try {
        const result = await callTool('watch-settings', { action: 'set-tmdb-key', key: key });
        status.className = 'status success';
        status.textContent = result.content[0].text;
        status.classList.remove('hidden');
        input.value = '';
        loadSettings();
      } catch (e) {
        status.className = 'status error';
        status.textContent = e.message;
        status.classList.remove('hidden');
      }
    }

    async function loadSettings() {
      const usageEl = document.getElementById('settings-usage');
      try {
        const result = await callTool('watch-settings', { action: 'view' });
        const text = result.content[0].text;
        const pre = document.createElement('pre');
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.color = 'var(--text-secondary)';
        pre.style.margin = '0';
        pre.textContent = text;
        usageEl.innerHTML = '';
        usageEl.appendChild(pre);
      } catch (e) {
        usageEl.textContent = e.message;
      }
    }

    // Watchlist tab
    let queueData = [];

    async function loadQueue() {
      try {
        const result = await callTool('watch-queue', { action: 'list', _raw: true });
        const text = result.content[0].text;
        try {
          queueData = JSON.parse(text);
        } catch {
          queueData = [];
        }
        renderQueue();
      } catch (err) {
        console.error('Failed to load queue:', err);
        queueData = [];
        renderQueue();
      }
    }

    function renderQueue() {
      const list = document.getElementById('queue-list');
      const empty = document.getElementById('queue-empty');

      // Apply client-side filters
      let filtered = queueData;
      const fp = document.getElementById('filter-priority').value;
      const ft = document.getElementById('filter-type').value;
      const ftag = document.getElementById('filter-tag').value.trim().toLowerCase();

      if (fp) filtered = filtered.filter(i => i.priority === fp);
      if (ft) filtered = filtered.filter(i => i.type === ft);
      if (ftag) filtered = filtered.filter(i => i.tags.some(t => t.toLowerCase().includes(ftag)));

      if (filtered.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'block';
        empty.textContent = queueData.length === 0
          ? 'Your watchlist is empty. Save titles to watch later using the watch-queue tool.'
          : 'No items match your filters.';
        return;
      }

      empty.style.display = 'none';
      list.innerHTML = filtered.map(item => {
        const poster = item.posterPath
          ? '<img src="https://image.tmdb.org/t/p/w92' + item.posterPath + '" style="width:60px; height:90px; border-radius:4px; object-fit:cover; flex-shrink:0;" />'
          : '<div style="width:60px; height:90px; background:var(--bg-secondary); border-radius:4px; flex-shrink:0;"></div>';
        const tags = (item.tags || []).map(t =>
          '<span style="font-size:0.7rem; padding:2px 8px; border-radius:10px; background:var(--tag-bg); color:var(--tag-text);">' + t + '</span>'
        ).join(' ');
        return '<div class="queue-card" data-tmdb-id="' + item.tmdbId + '" data-priority="' + item.priority + '" style="display:flex; gap:12px; background:var(--bg-card); border:1px solid var(--border); border-radius:8px; padding:12px; align-items:flex-start;">'
          + poster
          + '<div style="flex:1; min-width:0;">'
          + '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">'
          + '<strong style="color:var(--text-primary);">' + item.title + '</strong>'
          + '<span style="font-size:0.75rem; padding:2px 6px; border-radius:4px; background:var(--bg-secondary); color:var(--text-secondary);">' + item.type + '</span>'
          + '<span style="font-size:0.75rem; padding:2px 6px; border-radius:4px; color:#fff; background:var(--priority-' + item.priority + '); cursor:pointer;" onclick="cyclePriority(' + item.tmdbId + ')">' + item.priority + '</span>'
          + '</div>'
          + (tags ? '<div style="margin-top:4px; display:flex; gap:4px; flex-wrap:wrap;">' + tags + '</div>' : '')
          + '<div style="margin-top:6px; font-size:0.8rem; color:var(--text-secondary);">Added ' + item.addedDate + '</div>'
          + '</div>'
          + '<button onclick="removeFromQueue(' + item.tmdbId + ')" style="background:none; border:none; cursor:pointer; color:var(--text-secondary); font-size:1.2rem; padding:8px; min-width:44px; min-height:44px; display:flex; align-items:center; justify-content:center;" aria-label="Remove">&times;</button>'
          + '</div>';
      }).join('');
    }

    async function removeFromQueue(tmdbId) {
      await callTool('watch-queue', { action: 'remove', tmdbId: tmdbId });
      await loadQueue();
    }

    async function cyclePriority(tmdbId) {
      const priorities = ['low', 'medium', 'high'];
      const card = document.querySelector('.queue-card[data-tmdb-id="' + tmdbId + '"]');
      if (!card) return;
      const current = card.dataset.priority;
      const next = priorities[(priorities.indexOf(current) + 1) % 3];
      await callTool('watch-queue', { action: 'update', tmdbId: tmdbId, priority: next });
      await loadQueue();
    }

    // Feedback tab
    let feedbackData = [];

    async function loadFeedback() {
      try {
        const result = await callTool('watch-feedback', { action: 'list', statusFilter: 'all', _raw: true });
        const text = result.content[0].text;
        try {
          feedbackData = JSON.parse(text);
        } catch {
          feedbackData = [];
        }
        renderFeedback();
      } catch (err) {
        console.error('Failed to load feedback:', err);
        feedbackData = [];
        renderFeedback();
      }
    }

    function renderFeedback() {
      const list = document.getElementById('feedback-list');
      const empty = document.getElementById('feedback-empty');
      const filter = document.getElementById('feedback-status-filter').value;

      const filtered = filter === 'all' ? feedbackData : feedbackData.filter(i => i.status === filter);

      if (filtered.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'block';
        return;
      }

      empty.style.display = 'none';
      list.innerHTML = filtered.map(item => {
        const esc = (s) => { const el = document.createElement('span'); el.textContent = s; return el.innerHTML; };
        const badgeColors = { bug: 'var(--danger)', feature: 'var(--accent)', general: 'var(--text-secondary)' };
        const safeCat = esc(item.category);
        const badgeColor = badgeColors[item.category] || 'var(--text-secondary)';
        const safeMsg = esc(item.message);
        const safeUser = esc(item.userId);
        const safeStatus = esc(item.status);
        const safeId = esc(item.id);
        const date = new Date(item.createdAt).toLocaleString();

        const actions = item.status === 'open'
          ? '<div style="display:flex; gap:8px; margin-top:8px;">'
            + '<button class="resolve-btn" data-id="' + safeId + '">Resolve</button>'
            + '<button class="danger dismiss-btn" data-id="' + safeId + '">Dismiss</button>'
            + '</div>'
          : '<div style="margin-top:8px; font-size:0.8rem; text-transform:uppercase; color:var(--text-secondary);">' + safeStatus + '</div>';

        return '<div class="card">'
          + '<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">'
          + '<span style="font-size:0.75rem; padding:2px 8px; border-radius:10px; color:#fff; background:' + badgeColor + ';">' + safeCat + '</span>'
          + '<span style="font-size:0.85rem; color:var(--text-secondary);">' + safeUser + '</span>'
          + '<span style="font-size:0.8rem; color:var(--text-secondary); margin-left:auto;">' + date + '</span>'
          + '</div>'
          + '<div style="color:var(--text-primary); white-space:pre-wrap;">' + safeMsg + '</div>'
          + actions
          + '</div>';
      }).join('');
    }

    async function resolveFeedback(id) {
      await callTool('watch-feedback', { action: 'resolve', feedbackId: id });
      await loadFeedback();
    }

    async function dismissFeedback(id) {
      await callTool('watch-feedback', { action: 'dismiss', feedbackId: id });
      await loadFeedback();
    }

    document.getElementById('feedback-status-filter').addEventListener('change', renderFeedback);
    document.getElementById('feedback-list').addEventListener('click', async function(e) {
      const btn = e.target.closest('[data-id]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.classList.contains('resolve-btn')) await resolveFeedback(id);
      if (btn.classList.contains('dismiss-btn')) await dismissFeedback(id);
    });

    // Filter event listeners
    document.getElementById('filter-priority').addEventListener('change', renderQueue);
    document.getElementById('filter-type').addEventListener('change', renderQueue);
    document.getElementById('filter-tag').addEventListener('input', renderQueue);
    document.getElementById('filter-toggle')?.addEventListener('click', function() {
      document.getElementById('filter-bar').classList.toggle('show');
    });

    // Swipe-to-delete for mobile
    let touchStartX = 0;
    const queueList = document.getElementById('queue-list');
    if (queueList) {
      queueList.addEventListener('touchstart', function(e) {
        const card = e.target.closest('.queue-card');
        if (card) touchStartX = e.touches[0].clientX;
      });
      queueList.addEventListener('touchend', function(e) {
        const card = e.target.closest('.queue-card');
        if (!card) return;
        const diff = touchStartX - e.changedTouches[0].clientX;
        if (diff > 80) {
          const tmdbId = card.dataset.tmdbId;
          if (tmdbId) removeFromQueue(parseInt(tmdbId));
        }
      });
    }
  </script>
</body>
</html>`;
}
