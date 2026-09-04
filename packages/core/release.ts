import type { Case, Item } from './gate.js';
import { projectItems } from './project.js';
import type { KVStore } from './storage.js';
import { parseReleaseKey, randomId, releaseIndexPrefix } from './storage.js';

export interface QuoteSnapshot {
  offerRef?: string;
  total: number | null;
  currency: string;
  observedAt: string | null;
}

export interface Release {
  publicationId: string;
  caseId: string;
  createdAt: string;
  itemSet: Item[];
  observedQuotes: Record<string, QuoteSnapshot>;
  render: string;
  versions: { schema: string; rubric: string };
  contentHash: string;
}

function maskItemCompensation(item: Item): Item {
  return {
    ...item,
    // structuredClone rather than a shallow `{...item.facts}` — facts is unconstrained and
    // may hold nested objects; a shallow copy still aliases those nested values to the live
    // Case, so mutating them after freezing would silently change the "immutable" Release
    // while contentHash stays fixed.
    facts: item.facts ? structuredClone(item.facts) : item.facts,
    stamp: {
      ...item.stamp,
      economics: { compensation: null, endUserPrice: item.stamp.economics.endUserPrice },
      price: { ...item.stamp.price },
    },
  };
}

function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function freezeRelease(
  caseState: Case,
  render: string,
  versions: { schema: string; rubric: string },
): Release {
  const projected = projectItems(caseState);
  const itemSet = projected.map(maskItemCompensation);
  const createdAt = new Date().toISOString();

  const observedQuotes: Record<string, QuoteSnapshot> = {};
  for (const item of projected) {
    observedQuotes[item.id] = {
      offerRef: item.offerRef,
      total: item.stamp.price.total,
      currency: item.stamp.price.currency,
      observedAt: item.stamp.quotedAt ?? null,
    };
  }

  const contentHash = fnv1aHash(JSON.stringify({ itemSet, observedQuotes, versions }));

  return {
    publicationId: randomId('rel'),
    caseId: caseState.id,
    createdAt,
    itemSet,
    observedQuotes,
    render,
    // Copy rather than alias the caller's versions object — otherwise mutating it after
    // freezeRelease returns changes the "immutable" Release while contentHash stays fixed.
    versions: { ...versions },
    contentHash,
  };
}

export async function listReleases(store: KVStore, caseId: string): Promise<Release[]> {
  const keys = await store.list(releaseIndexPrefix(caseId));
  const releases: Release[] = [];
  for (const key of keys) {
    // Defense-in-depth: the prefix scan above should already be exact (releaseIndexPrefix
    // percent-encodes caseId so it can't be a loose prefix of another caseId's keys), but
    // parse+compare the caseId segment explicitly so a cross-case leak can never slip
    // through even if the store's prefix matching is looser than expected (bug: cross-case
    // release disclosure).
    const parsed = parseReleaseKey(key);
    if (!parsed || parsed.caseId !== caseId) continue;
    const raw = await store.get(key);
    if (raw) releases.push(JSON.parse(raw));
  }
  releases.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return releases;
}
