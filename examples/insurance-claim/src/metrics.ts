import type { Case, FunnelState } from '@scaffold/core';
import type { DeskMetrics } from '@scaffold/core';

export function computeClaimMetrics(caseState: Case): DeskMetrics {
  const sum = (states: FunnelState[]) => caseState.items
    .filter((i) => states.includes(i.state))
    .reduce((total, i) => total + (i.stamp.price.total ?? 0), 0);
  const claimed = sum(['recommended', 'selected', 'confirmed', 'booked']);
  const approved = sum(['confirmed', 'booked']);
  return { claimed, approved, gap: claimed - approved };
}
