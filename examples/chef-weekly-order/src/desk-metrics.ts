import type { DeskMetrics, KVStore, Item } from '@scaffold/core';
import { setDeskMetrics } from '@scaffold/core';

export function computeMetrics(items: Item[]): DeskMetrics {
  let planned = 0;
  let ordered = 0;
  let received = 0;
  for (const item of items) {
    if (item.state === 'recommended' || item.state === 'selected') planned += 1;
    else if (item.state === 'confirmed') ordered += 1;
    else if (item.state === 'booked') received += 1;
  }
  return { planned, ordered, received };
}

// Publishes the domain money bar THROUGH the core Desk contract.
export async function publishChefMetrics(store: KVStore, caseId: string, items: Item[]): Promise<void> {
  await setDeskMetrics(store, caseId, computeMetrics(items));
}
