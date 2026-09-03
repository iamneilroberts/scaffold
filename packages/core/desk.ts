import type { Case } from './gate.js';
import type { Offer } from './offer.js';
import type { KVStore } from './storage.js';
import { caseKey, eventsKey } from './storage.js';

export interface DeskSummary {
  headline: string;
  note?: string;
  updatedAt: string;
}

export interface DeskEvent {
  seq: number;
  at: string;
  kind: string;
  detail?: Record<string, unknown>;
}

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

  const rawEvents = await store.get(eventsKey(caseId));
  const allEvents: DeskEvent[] = rawEvents ? JSON.parse(rawEvents) : [];
  const events = allEvents.filter((e) => e.seq > since);
  const maxSeq = allEvents.length > 0 ? allEvents[allEvents.length - 1].seq : 0;

  const offers: Offer[] = caseState?._offers ? Object.values(caseState._offers) : [];
  const meta = (caseState?.meta ?? {}) as { deskSummary?: DeskSummary; deskMetrics?: DeskMetrics };
  const summary: DeskSummary = meta.deskSummary ?? {
    headline: '',
    updatedAt: new Date().toISOString(),
  };
  const metrics: DeskMetrics = meta.deskMetrics ?? {};

  return { summary, offers, events, metrics, maxSeq };
}

export async function setDeskSummary(store: KVStore, caseId: string, summary: DeskSummary): Promise<void> {
  const raw = await store.get(caseKey(caseId));
  if (!raw) return;
  const caseState: Case = JSON.parse(raw);
  const meta = { ...(caseState.meta ?? {}), deskSummary: summary };
  await store.put(caseKey(caseId), JSON.stringify({ ...caseState, meta }));
}

export async function setDeskMetrics(store: KVStore, caseId: string, metrics: DeskMetrics): Promise<void> {
  const raw = await store.get(caseKey(caseId));
  if (!raw) return;
  const caseState: Case = JSON.parse(raw);
  const meta = { ...(caseState.meta ?? {}), deskMetrics: metrics };
  await store.put(caseKey(caseId), JSON.stringify({ ...caseState, meta }));
}
