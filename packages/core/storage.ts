import type { Case } from './gate.js';

export interface KVStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
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
  return { id, facts: {}, items: [], lifecycle: 'planning', _offers: {} };
}
