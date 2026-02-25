/**
 * Feedback admin tab for the /admin dashboard.
 *
 * Displays user feedback with status filtering and resolve/dismiss actions.
 */

import type { AdminTab, AdminContext } from '@voygent/scaffold-core';
import { storage as storageUtils } from '@voygent/scaffold-core';
import type { FeedbackItem } from './types.js';
import { feedbackKey, feedbackPrefix } from './keys.js';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const feedbackAdminTab: AdminTab = {
  id: 'feedback',
  label: 'Feedback',
  icon: '💬',
  order: 50,

  render: async (ctx: AdminContext) => {
    const listResult = await ctx.storage.list(feedbackPrefix(), { limit: 500 });
    const itemsMap = await storageUtils.batchGet<FeedbackItem>(ctx.storage, listResult.keys);
    const items = Array.from(itemsMap.values());
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const badgeColors: Record<string, string> = {
      bug: 'var(--color-error, #e74c3c)',
      feature: 'var(--color-primary, #5a52d5)',
      general: 'var(--color-muted, #888)',
    };

    const cards = items.map(item => {
      const badgeColor = badgeColors[item.category] || badgeColors.general;
      const date = new Date(item.createdAt).toLocaleString();
      const actions = item.status === 'open'
        ? `<div style="display:flex; gap:8px; margin-top:8px;">
             <button class="btn btn-sm btn-primary resolve-btn" data-id="${escapeHtml(item.id)}">Resolve</button>
             <button class="btn btn-sm btn-danger dismiss-btn" data-id="${escapeHtml(item.id)}">Dismiss</button>
           </div>`
        : `<div style="margin-top:8px; font-size:0.8rem; text-transform:uppercase; opacity:0.6;">${escapeHtml(item.status)}</div>`;

      return `<div class="card" data-status="${escapeHtml(item.status)}" style="margin-bottom:12px;">
        <div class="card-body">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <span class="badge" style="background:${badgeColor}; color:#fff;">${escapeHtml(item.category)}</span>
            <span style="font-size:0.85rem; opacity:0.7;">${escapeHtml(item.userId)}</span>
            <span style="font-size:0.8rem; opacity:0.6; margin-left:auto;">${escapeHtml(date)}</span>
          </div>
          <div style="white-space:pre-wrap;">${escapeHtml(item.message)}</div>
          ${actions}
        </div>
      </div>`;
    }).join('');

    const html = `
      <div class="page-header">
        <h1 class="page-title">Feedback</h1>
      </div>

      <div style="margin-bottom:16px;">
        <label for="feedback-status-filter" style="font-weight:600; margin-right:8px;">Status:</label>
        <select id="feedback-status-filter" class="form-select" style="width:auto; display:inline-block;">
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
          <option value="all">All</option>
        </select>
      </div>

      <div id="feedback-list">
        ${cards || '<p style="opacity:0.6; text-align:center; padding:40px 0;">No feedback yet.</p>'}
      </div>
    `;

    const script = `
      (function() {
        var filter = document.getElementById('feedback-status-filter');
        var list = document.getElementById('feedback-list');

        function applyFilter() {
          var val = filter.value;
          var cards = list.querySelectorAll('.card[data-status]');
          var anyVisible = false;
          cards.forEach(function(card) {
            var show = val === 'all' || card.getAttribute('data-status') === val;
            card.style.display = show ? '' : 'none';
            if (show) anyVisible = true;
          });
          var emptyMsg = list.querySelector('.feedback-empty-msg');
          if (!anyVisible) {
            if (!emptyMsg) {
              emptyMsg = document.createElement('p');
              emptyMsg.className = 'feedback-empty-msg';
              emptyMsg.style.cssText = 'opacity:0.6; text-align:center; padding:40px 0;';
              emptyMsg.textContent = 'No feedback matching this filter.';
              list.appendChild(emptyMsg);
            }
            emptyMsg.style.display = '';
          } else if (emptyMsg) {
            emptyMsg.style.display = 'none';
          }
        }

        filter.addEventListener('change', applyFilter);
        applyFilter();

        list.addEventListener('click', async function(e) {
          var btn = e.target.closest('[data-id]');
          if (!btn) return;
          var id = btn.getAttribute('data-id');
          var action = btn.classList.contains('resolve-btn') ? 'resolve' : btn.classList.contains('dismiss-btn') ? 'dismiss' : null;
          if (!action) return;
          btn.disabled = true;
          btn.textContent = action === 'resolve' ? 'Resolving...' : 'Dismissing...';
          try {
            var res = await fetch('/admin/api/feedback/' + action, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ feedbackId: id }),
            });
            if (!res.ok) throw new Error(await res.text());
            location.reload();
          } catch (err) {
            alert('Failed: ' + err.message);
            btn.disabled = false;
            btn.textContent = action === 'resolve' ? 'Resolve' : 'Dismiss';
          }
        });
      })();
    `;

    return { html, script };
  },

  routes: [
    {
      method: 'POST',
      path: '/api/feedback/resolve',
      handler: async (request: Request, ctx: AdminContext) => {
        const body = await request.json() as { feedbackId?: string };
        const { feedbackId } = body;
        if (!feedbackId) {
          return new Response(JSON.stringify({ error: 'feedbackId required' }), { status: 400 });
        }
        const key = feedbackKey(feedbackId);
        const item = await ctx.storage.get<FeedbackItem>(key);
        if (!item) {
          return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
        }
        item.status = 'resolved';
        await ctx.storage.put(key, item);
        return new Response(JSON.stringify({ ok: true }));
      },
    },
    {
      method: 'POST',
      path: '/api/feedback/dismiss',
      handler: async (request: Request, ctx: AdminContext) => {
        const body = await request.json() as { feedbackId?: string };
        const { feedbackId } = body;
        if (!feedbackId) {
          return new Response(JSON.stringify({ error: 'feedbackId required' }), { status: 400 });
        }
        const key = feedbackKey(feedbackId);
        const item = await ctx.storage.get<FeedbackItem>(key);
        if (!item) {
          return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
        }
        item.status = 'dismissed';
        await ctx.storage.put(key, item);
        return new Response(JSON.stringify({ ok: true }));
      },
    },
  ],

  getBadge: async (ctx: AdminContext) => {
    const listResult = await ctx.storage.list(feedbackPrefix(), { limit: 500 });
    if (listResult.keys.length === 0) return null;
    const itemsMap = await storageUtils.batchGet<FeedbackItem>(ctx.storage, listResult.keys);
    const openCount = Array.from(itemsMap.values()).filter(i => i.status === 'open').length;
    if (openCount === 0) return null;
    return { text: String(openCount), type: 'info' as const };
  },
};
