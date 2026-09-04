import { describe, it, expect } from 'vitest';
import { createMemoryStore, getCase } from '@scaffold/core';
import { seedCase, CASE_ID } from './support/seed.js';
import { addClaimLine } from '../src/intake.js';
import { toContractorOffers } from '../src/sources/contractor-estimate.js';
import { sampleContractorEstimate } from '../src/fixtures/contractor-estimate.fixture.js';
import { toBlsPpiOffers } from '../src/sources/bls-ppi.js';
import { sampleBlsPpiResponse } from '../src/fixtures/bls-ppi.fixture.js';
import { toOpenFemaOffers } from '../src/sources/openfema.js';
import { sampleOpenFemaDeclarations, SAMPLE_LOSS_DATE } from '../src/fixtures/openfema.fixture.js';
import { INSURER_VIEW, CONTRACTOR_VIEW, renderClaimView } from '../src/views.js';
import { getClaimDeskPayload } from '../src/desk.js';
import { submitClaim, listClaimReleases } from '../src/submit-claim.js';

describe('insurance-claim end-to-end', () => {
  it('runs contractor + BLS PPI + OpenFEMA through the Gate, renders masked views, reports a money bar, and freezes a release', async () => {
    const store = createMemoryStore();
    await seedCase(store);

    const [roofOffer, drywallOffer] = toContractorOffers(sampleContractorEstimate());
    const [materialsOffer] = toBlsPpiOffers(sampleBlsPpiResponse());
    const [coverageOffer] = toOpenFemaOffers(sampleOpenFemaDeclarations(), { lossDate: SAMPLE_LOSS_DATE });

    await addClaimLine(store, CASE_ID, roofOffer);
    await addClaimLine(store, CASE_ID, drywallOffer);
    await addClaimLine(store, CASE_ID, materialsOffer);
    await addClaimLine(store, CASE_ID, coverageOffer);

    const caseState = (await getCase(store, CASE_ID))!;
    expect(caseState.items).toHaveLength(4);

    const insurerData = renderClaimView(caseState, INSURER_VIEW);
    const contractorData = renderClaimView(caseState, CONTRACTOR_VIEW);
    const insurerItems = insurerData.sections.flatMap((s) => s.items);
    expect(insurerItems.every((i) => i.stamp.economics.compensation === null)).toBe(true);
    const contractorItems = contractorData.sections.flatMap((s) => s.items);
    const managedItem = contractorItems.find((i) => i.stamp.actionable === 'managed');
    expect(managedItem?.stamp.economics.compensation).not.toBeNull();

    const desk = await getClaimDeskPayload(store, CASE_ID, 0);
    expect(desk.metrics.claimed).toBe(11494 + 3104);

    const release = await submitClaim(store, CASE_ID);
    expect(release.itemSet).toHaveLength(4);
    const all = await listClaimReleases(store, CASE_ID);
    expect(all).toHaveLength(1);
  });
});
