import type { Case } from './gate.js';
import type { Offer } from './offer.js';
import type { Release } from './release.js';

export interface KVStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  // Optional atomic compare-and-swap: writes `value` only if the current stored
  // value at `key` is still exactly `expected` (the raw string previously read),
  // returning true on a successful swap and false (no write) otherwise. This is
  // what gives commitAction's optimistic-concurrency check (bug #4) a real
  // guarantee — a plain get()-then-put() read-modify-write has a race window
  // between the check and the write that two truly concurrent callers can both
  // pass. Hosts that can't offer an atomic primitive may omit this; commitAction
  // falls back to a best-effort read-recheck-write for them.
  casPut?(key: string, expected: string | null, value: string): Promise<boolean>;
}

export function createMemoryStore(): KVStore {
  const data = new Map<string, string>();
  return {
    async get(key) {
      return data.has(key) ? data.get(key)! : null;
    },
    async put(key, value) {
      data.set(key, value);
    },
    async list(prefix) {
      return Array.from(data.keys()).filter((key) => key.startsWith(prefix));
    },
    async casPut(key, expected, value) {
      const current = data.has(key) ? data.get(key)! : null;
      if (current !== expected) return false;
      data.set(key, value);
      return true;
    },
  };
}

export function randomId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

export function caseKey(caseId: string): string {
  return `case:${caseId}`;
}

export function eventsKey(caseId: string): string {
  return `events:${caseId}`;
}

export function releaseKey(caseId: string, publicationId: string): string {
  return `release:${caseId}:${publicationId}`;
}

export function releaseIndexPrefix(caseId: string): string {
  return `release:${caseId}:`;
}

export function newCase(id: string): Case {
  return { id, facts: {}, items: [], lifecycle: 'planning', _offers: {}, rev: 0 };
}

export async function getCase(store: KVStore, caseId: string): Promise<Case | undefined> {
  const raw = await store.get(caseKey(caseId));
  return raw ? (JSON.parse(raw) as Case) : undefined;
}

// Advances Case.rev on every write so commitAction's optimistic-concurrency check
// (bug #4) sees this mutation. Any writer that persists a Case must go through
// here (or bump rev itself) — see gate.ts commitAction's doc comment.
export async function putCase(store: KVStore, caseId: string, c: Case): Promise<void> {
  await store.put(caseKey(caseId), JSON.stringify({ ...c, rev: (c.rev ?? 0) + 1 }));
}

export async function stageOffers(store: KVStore, caseId: string, offers: Offer[]): Promise<void> {
  const c = await getCase(store, caseId);
  if (!c) return;
  const merged = { ...(c._offers ?? {}) };
  for (const offer of offers) {
    merged[offer.offerRef] = offer;
  }
  await putCase(store, caseId, { ...c, _offers: merged });
}

export async function putRelease(store: KVStore, release: Release): Promise<void> {
  await store.put(releaseKey(release.caseId, release.publicationId), JSON.stringify(release));
}
