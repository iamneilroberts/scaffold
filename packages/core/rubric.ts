export interface RubricEntry {
  source: string;
  productType: string;
  class: 'actionable' | 'reference';
  actionable: 'managed' | 'referral' | 'none';
  quoteTtlMinutes: number;
  compensationAvailable: boolean;
  markupCapable: boolean;
  reachable: boolean;
}

export function rubricFor(rubric: RubricEntry[], productType: string): RubricEntry | undefined {
  return rubric.find((entry) => entry.productType === productType);
}

export function actionableFor(rubric: RubricEntry[], source: string): 'managed' | 'referral' | 'none' {
  const entry = rubric.find((r) => r.source === source);
  return entry ? entry.actionable : 'none';
}

export function compensationAvailableFor(rubric: RubricEntry[], source: string): boolean {
  const entry = rubric.find((r) => r.source === source);
  return entry ? entry.compensationAvailable : false;
}

export function quoteTtlMinutesFor(rubric: RubricEntry[], source: string): number {
  const entry = rubric.find((r) => r.source === source);
  return entry ? entry.quoteTtlMinutes : 0;
}
