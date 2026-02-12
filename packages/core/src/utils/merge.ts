import type { StorageAdapter, StoragePutOptions } from '../types/public-api.js';

export interface MergeOptions<T> {
  preserveFields?: (keyof T)[];
  fieldMergers?: Partial<Record<keyof T, (existing: unknown, incoming: unknown) => unknown>>;
  arrayStrategy?: 'replace' | 'append' | 'union';
  putOptions?: StoragePutOptions;
}

export interface MergeResult<T> {
  merged: T;
  created: boolean;
  fieldsUpdated: string[];
}

export async function mergeAndPut<T extends Record<string, unknown>>(
  storage: StorageAdapter,
  key: string,
  incoming: Partial<T>,
  options?: MergeOptions<T>
): Promise<MergeResult<T>> {
  const existing = await storage.get<T>(key);

  if (!existing) {
    await storage.put(key, incoming, options?.putOptions);
    return { merged: incoming as T, created: true, fieldsUpdated: Object.keys(incoming) };
  }

  const fieldsUpdated: string[] = [];
  const merged = { ...existing } as Record<string, unknown>;

  for (const [field, value] of Object.entries(incoming)) {
    // Rule 5: never overwrite with null/undefined
    if (value == null) continue;

    // Rule 1: preserve fields that already have values
    if (options?.preserveFields?.includes(field as keyof T) && existing[field] != null) {
      continue;
    }

    // Rule 2: custom field merger
    const merger = options?.fieldMergers?.[field as keyof T];
    if (merger) {
      merged[field] = merger(existing[field], value);
      fieldsUpdated.push(field);
      continue;
    }

    // Rule 3: array merge strategy
    if (Array.isArray(value) && Array.isArray(existing[field])) {
      const strategy = options?.arrayStrategy ?? 'replace';
      if (strategy === 'append') {
        merged[field] = [...(existing[field] as unknown[]), ...value];
      } else if (strategy === 'union') {
        merged[field] = [...new Set([...(existing[field] as unknown[]), ...value])];
      } else {
        merged[field] = value;
      }
      fieldsUpdated.push(field);
      continue;
    }

    // Rule 4: overwrite
    merged[field] = value;
    fieldsUpdated.push(field);
  }

  await storage.put(key, merged, options?.putOptions);
  return { merged: merged as T, created: false, fieldsUpdated };
}

export const merge = { mergeAndPut };
