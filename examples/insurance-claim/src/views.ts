import { renderView } from '@scaffold/core';
import type { ViewPreset, ViewData } from '@scaffold/core';
import type { Case } from '@scaffold/core';

export const INSURER_VIEW: ViewPreset = { name: 'insurer', priceDisplayMode: 'end_user', showCompensation: false };
export const HOMEOWNER_VIEW: ViewPreset = { name: 'homeowner', priceDisplayMode: 'end_user', showCompensation: false };
export const CONTRACTOR_VIEW: ViewPreset = { name: 'contractor', priceDisplayMode: 'full', showCompensation: true };

export function renderClaimView(caseState: Case, preset: ViewPreset): ViewData {
  const data = renderView(caseState, preset);
  if (preset.showCompensation) return data;
  return {
    ...data,
    sections: data.sections.map((s) => ({
      section: s.section,
      items: s.items.map((i) => ({
        ...i,
        stamp: { ...i.stamp, economics: { ...i.stamp.economics, compensation: null } },
      })),
    })),
  };
}
