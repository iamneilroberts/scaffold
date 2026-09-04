import { freezeRelease, listReleases, putRelease, getCase } from '@scaffold/core';
import type { Release, KVStore } from '@scaffold/core';
import { renderClaimPacket } from './render.js';

const CLAIM_SCHEMA_VERSION = 'insurance-claim-v1';
const CLAIM_RUBRIC_VERSION = 'claim-rubric-v1';

export async function submitClaim(store: KVStore, caseId: string): Promise<Release> {
  const caseState = await getCase(store, caseId);
  if (!caseState) throw new Error(`case ${caseId} not found`);
  const render = renderClaimPacket(caseState);
  const release = freezeRelease(caseState, render, { schema: CLAIM_SCHEMA_VERSION, rubric: CLAIM_RUBRIC_VERSION });
  await putRelease(store, release);
  return release;
}

export async function listClaimReleases(store: KVStore, caseId: string): Promise<Release[]> {
  return listReleases(store, caseId);
}
