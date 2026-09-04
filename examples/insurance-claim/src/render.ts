import type { Case } from '@scaffold/core';

export function renderClaimPacket(caseState: Case): string {
  const lines = caseState.items.map(
    (i) => `- ${i.productType} [${i.state}] ${i.stamp.price.total ?? 'n/a'} ${i.stamp.price.currency}`,
  );
  return [`Claim packet for case ${caseState.id}`, `Address: ${caseState.facts.propertyAddress ?? 'unknown'}`, ...lines].join('\n');
}
