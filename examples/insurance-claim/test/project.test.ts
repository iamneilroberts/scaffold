import { describe, it, expect } from 'vitest';
import { createMemoryStore } from '@scaffold/core';
import { commitAction } from '@scaffold/core';
import { projectItems } from '@scaffold/core';
import { seedCase, CASE_ID } from './support/seed.js';
import { addClaimLine, registerOffers } from '../src/intake.js';
import { toContractorOffers } from '../src/sources/contractor-estimate.js';
import { sampleContractorEstimate } from '../src/fixtures/contractor-estimate.fixture.js';

describe('projectItems', () => {
  it('a revised contractor bid replaces the original line — one projected item, the new total', async () => {
    const store = createMemoryStore();
    await seedCase(store);

    const [original] = toContractorOffers(sampleContractorEstimate());
    const added = await addClaimLine(store, CASE_ID, original);
    const itemId = added.case!.items[0].id;

    const revisedEstimate = sampleContractorEstimate();
    revisedEstimate.lines[0].total = 12500;
    const [revised] = toContractorOffers(revisedEstimate);
    await registerOffers(store, CASE_ID, [revised]);

    const replaced = await commitAction(store, CASE_ID, { type: 'replace_item', itemId, offerRef: revised.offerRef });
    expect(replaced.ok).toBe(true);

    const items = projectItems(replaced.case!);
    expect(items).toHaveLength(1);
    expect(items[0].stamp.price.total).toBe(12500);
  });
});
