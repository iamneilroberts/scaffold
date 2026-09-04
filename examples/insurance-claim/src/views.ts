import { renderView } from '@scaffold/core';
import type { ViewPreset, ViewData } from '@scaffold/core';
import type { Case } from '@scaffold/core';

export const INSURER_VIEW: ViewPreset = { name: 'insurer', priceDisplayMode: 'end_user', showCompensation: false };
export const HOMEOWNER_VIEW: ViewPreset = { name: 'homeowner', priceDisplayMode: 'end_user', showCompensation: false };
export const CONTRACTOR_VIEW: ViewPreset = { name: 'contractor', priceDisplayMode: 'full', showCompensation: true };

export function renderClaimView(caseState: Case, preset: ViewPreset): ViewData {
  return renderView(caseState, preset);
}
