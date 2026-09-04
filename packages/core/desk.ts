import type { Case, CaseEvent } from './gate.js';
import type { Offer } from './offer.js';
import type { KVStore } from './storage.js';
import { caseKey } from './storage.js';

export interface DeskSummary {
  headline: string;
  note?: string;
  updatedAt: string;
}

// Same shape as Case.events entries (gate.ts CaseEvent) — the event log lives
// on the Case (bug #4b) and deskPayload just reads it back.
export type DeskEvent = CaseEvent;

export interface DeskMetrics {
  [label: string]: number | null;
}

export interface DeskPayload {
  summary: DeskSummary;
  offers: Offer[];
  events: DeskEvent[];
  metrics: DeskMetrics;
  maxSeq: number;
}

export async function deskPayload(store: KVStore, caseId: string, since: number): Promise<DeskPayload> {
  const rawCase = await store.get(caseKey(caseId));
  const caseState: Case | null = rawCase ? JSON.parse(rawCase) : null;

  const allEvents: DeskEvent[] = caseState?.events ?? [];
  const events = allEvents.filter((e) => e.seq > since);
  const maxSeq = allEvents.length > 0 ? allEvents[allEvents.length - 1].seq : 0;

  const rawOffers: Offer[] = caseState?._offers ? Object.values(caseState._offers) : [];
  // Mask for an end-user-watchable surface: no compensation, no raw supplier data.
  // Copies only — the stored Case offers must not be mutated by reading the desk.
  const offers: Offer[] = rawOffers.map((offer) => {
    const { raw: _raw, ...rest } = offer;
    return { ...rest, economics: { ...rest.economics, compensation: null } };
  });
  const meta = (caseState?.meta ?? {}) as { deskSummary?: DeskSummary; deskMetrics?: DeskMetrics };
  const summary: DeskSummary = meta.deskSummary ?? {
    headline: '',
    updatedAt: new Date().toISOString(),
  };
  const metrics: DeskMetrics = meta.deskMetrics ?? {};

  return { summary, offers, events, metrics, maxSeq };
}

// Bug #4a: setDeskSummary/setDeskMetrics used to be an unconditional
// read-modify-write, ignoring store.casPut entirely. That let a desk write
// silently clobber a concurrent commitAction: Promise.all([commitAction(...),
// setDeskMetrics(...)]) could return ok:true from commitAction while the
// metrics write (built from a stale pre-commit read) overwrote it wholesale,
// erasing the just-committed item/state. Fixed by writing through casPut with
// a retry loop — on a CAS conflict we re-read the (now newer) Case and
// re-apply just this call's own meta field on top of it. That's safe and
// idempotent because setDeskSummary/setDeskMetrics only ever touch their own
// `meta.deskSummary` / `meta.deskMetrics` key, so replaying them against
// fresher state (e.g. after a concurrent commitAction won) never clobbers
// that state's items/lifecycle/events — only the desk's own field changes.
const MAX_CAS_ATTEMPTS = 20;

async function patchCaseMeta(
  store: KVStore,
  caseId: string,
  applyPatch: (meta: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const raw = await store.get(caseKey(caseId));
    if (!raw) return;
    const caseState: Case = JSON.parse(raw);
    const meta = applyPatch(caseState.meta ?? {});
    const nextRaw = JSON.stringify({ ...caseState, meta, rev: (caseState.rev ?? 0) + 1 });

    if (store.casPut) {
      if (await store.casPut(caseKey(caseId), raw, nextRaw)) return;
      continue; // lost the race — re-read fresh state and retry
    }
    const recheckRaw = await store.get(caseKey(caseId));
    if (recheckRaw !== raw) continue; // lost the race — re-read fresh state and retry
    await store.put(caseKey(caseId), nextRaw);
    return;
  }
  throw new Error(`patchCaseMeta: exceeded ${MAX_CAS_ATTEMPTS} CAS retry attempts for case ${caseId}`);
}

export async function setDeskSummary(store: KVStore, caseId: string, summary: DeskSummary): Promise<void> {
  await patchCaseMeta(store, caseId, (meta) => ({ ...meta, deskSummary: summary }));
}

export async function setDeskMetrics(store: KVStore, caseId: string, metrics: DeskMetrics): Promise<void> {
  await patchCaseMeta(store, caseId, (meta) => ({ ...meta, deskMetrics: metrics }));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function deskShellHtml(caseId: string): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Desk</title></head>
<body>
<div id="desk-root" data-case-id="${escapeHtml(caseId)}">Loading…</div>
<script>
(function () {
  var caseId = ${JSON.stringify(caseId).replace(/</g, '\\u003c')};
  var since = 0;
  function poll() {
    fetch('/api/cases/' + encodeURIComponent(caseId) + '/desk?since=' + since)
      .then(function (res) { return res.json(); })
      .then(function (payload) {
        since = payload.maxSeq;
        document.getElementById('desk-root').textContent = JSON.stringify(payload, null, 2);
      });
  }
  poll();
  setInterval(poll, 2500);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) poll();
  });
})();
</script>
</body>
</html>`;
}
