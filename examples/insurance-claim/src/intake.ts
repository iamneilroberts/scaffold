import { commitAction, stageOffers } from '@scaffold/core';
import type { CommitResult } from '@scaffold/core';
import type { KVStore } from '@scaffold/core';
import type { Offer } from '@scaffold/core';

export async function registerOffers(store: KVStore, caseId: string, offers: Offer[]): Promise<void> {
  await stageOffers(store, caseId, offers);
}

export async function addClaimLine(store: KVStore, caseId: string, offer: Offer): Promise<CommitResult> {
  await registerOffers(store, caseId, [offer]);
  return commitAction(store, caseId, { type: 'add_item', offerRef: offer.offerRef });
}
