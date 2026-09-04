import { buildDeskPayload, setDeskMetrics, getCase } from '@scaffold/core';
import type { DeskPayload, KVStore } from '@scaffold/core';
import { computeClaimMetrics } from './metrics.js';

// Reads the Case ONCE and derives both the metrics and the rest of the returned
// payload from that same snapshot, so the two can never disagree about which
// state of the Case they're describing (bug: computing metrics from one read
// then letting deskPayload do its own, later, re-read could return a payload
// whose metrics reflect an older Case than its offers/events).
export async function getClaimDeskPayload(store: KVStore, caseId: string, since: number): Promise<DeskPayload> {
  const caseState = await getCase(store, caseId);
  if (!caseState) {
    return buildDeskPayload(caseState, since);
  }
  const metrics = computeClaimMetrics(caseState);
  // Best-effort persist so a later poll (a separate call, reading a possibly
  // newer Case) also sees these metrics via core's deskPayload/meta.deskMetrics.
  await setDeskMetrics(store, caseId, metrics);
  return { ...buildDeskPayload(caseState, since), metrics };
}
