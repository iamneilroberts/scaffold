import { deskPayload, setDeskMetrics, getCase } from '@scaffold/core';
import type { DeskPayload, KVStore } from '@scaffold/core';
import { computeClaimMetrics } from './metrics.js';

export async function getClaimDeskPayload(store: KVStore, caseId: string, since: number): Promise<DeskPayload> {
  const caseState = await getCase(store, caseId);
  if (caseState) {
    await setDeskMetrics(store, caseId, computeClaimMetrics(caseState));
  }
  return deskPayload(store, caseId, since);
}
