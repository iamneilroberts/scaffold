import { readFileSync } from 'node:fs';
import { renderView, freezeRelease, type Release, type DeskMetrics } from '@scaffold/core';
import { fdcSource } from './sources/fdc-source.js';
import { nassSource } from './sources/nass-source.js';
import { localFarmSource } from './sources/local-farm-source.js';
import { buildInitialCase, cacheOffer, attemptConfirmOrderLine } from './order-cycle.js';
import { GUEST_MENU_PRESET, renderGuestMenuLine } from './views.js';
import { computeMetrics } from './desk-metrics.js';
import type { FdcSearchResponse, LocalFarmVendor, NassQuickStatsResponse } from './types.js';

function loadFixture<T>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as T;
}

export function runDemo(): { release: Release; guestMenu: string[]; metrics: DeskMetrics } {
  const fdcRaw = loadFixture<FdcSearchResponse>('../test/fixtures/fdc-shrimp-search.json');
  const nassRaw = loadFixture<NassQuickStatsResponse>('../test/fixtures/nass-shrimp-price.json');
  const farmRaw = loadFixture<LocalFarmVendor[]>('../test/fixtures/local-farm-vendors.json');

  const fdcOffer = fdcSource.toOffers(fdcRaw)[0];
  const nassOffer = nassSource.toOffers(nassRaw)[0];
  const farmOffer = localFarmSource.toOffers(farmRaw)[0];

  let caseState = buildInitialCase('case_weekly_2026w36');
  caseState = cacheOffer(caseState, fdcOffer);
  caseState = cacheOffer(caseState, nassOffer);
  caseState = cacheOffer(caseState, farmOffer);

  // Spot-market price is reference-only: attempted confirm is refused by the Gate.
  attemptConfirmOrderLine(caseState, nassOffer.offerRef);
  // Approved local farm vendor: confirms successfully.
  const { case: confirmedCase } = attemptConfirmOrderLine(caseState, farmOffer.offerRef);

  const view = renderView(confirmedCase, GUEST_MENU_PRESET);
  const guestMenu = view.sections.flatMap((s) => s.items).map((item) => renderGuestMenuLine(item, confirmedCase));

  const release = freezeRelease(confirmedCase, '<html>Weekly order — case_weekly_2026w36</html>', {
    schema: 'chef-v1',
    rubric: 'chef-rubric-v1',
  });

  const metrics = computeMetrics(confirmedCase.items);

  return { release, guestMenu, metrics };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { release, guestMenu, metrics } = runDemo();
  console.log('Release:', release.publicationId);
  console.log('Guest menu:', guestMenu.join(', '));
  console.log('Metrics:', metrics);
}
