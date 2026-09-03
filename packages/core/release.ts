import type { Case, Item } from './gate.js';
import { projectItems } from './project.js';
import type { KVStore } from './storage.js';
import { randomId, releaseIndexPrefix } from './storage.js';

export interface QuoteSnapshot {
  offerRef?: string;
  total: number | null;
  currency: string;
  basis?: string;
  observedAt: string;
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
    stamp: {
      ...item.stamp,
      economics: { compensation: null, endUserPrice: item.stamp.economics.endUserPrice },
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
  const itemSet = projectItems(caseState).map(maskItemCompensation);
  const createdAt = new Date().toISOString();

  const observedQuotes: Record<string, QuoteSnapshot> = {};
  for (const item of itemSet) {
    observedQuotes[item.id] = {
      offerRef: item.offerRef,
      total: item.stamp.price.total,
      currency: item.stamp.price.currency,
      basis: item.stamp.economics.compensation?.basis,
      observedAt: item.stamp.quotedAt ?? createdAt,
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
    versions,
    contentHash,
  };
}

export async function listReleases(store: KVStore, caseId: string): Promise<Release[]> {
  const keys = await store.list(releaseIndexPrefix(caseId));
  const releases: Release[] = [];
  for (const key of keys) {
    const raw = await store.get(key);
    if (raw) releases.push(JSON.parse(raw));
  }
  releases.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return releases;
}
