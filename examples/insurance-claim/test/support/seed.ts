import type { KVStore, Case } from '@scaffold/core';
import { putCase } from '@scaffold/core';

export const CASE_ID = 'case-demo-001';

export async function seedCase(store: KVStore, caseId: string = CASE_ID): Promise<void> {
  const caseState: Case = {
    id: caseId,
    facts: { propertyAddress: '142 Bayshore Dr, Panama City, FL', county: 'Bay', state: 'FL' },
    items: [],
    lifecycle: 'active',
    _offers: {},
  };
  await putCase(store, caseId, caseState);
}
