const iso = (deltaDays: number) => new Date(Date.now() + deltaDays * 86_400_000).toISOString();

export interface ContractorEstimateLine {
  code: string; description: string; quantity: number; unit: string;
  unitPrice: number; total: number;
}
export interface ContractorEstimateRaw {
  estimateId: string; contractor: string; propertyAddress: string; preparedAt: string;
  lines: ContractorEstimateLine[];
}

export function sampleContractorEstimate(): ContractorEstimateRaw {
  return {
    estimateId: 'est-0091',
    contractor: 'Coastal Restoration LLC',
    propertyAddress: '142 Bayshore Dr, Panama City, FL',
    preparedAt: iso(-3),
    lines: [
      { code: 'RF-01', description: 'Replace 30yr architectural shingle roof, 28 sq', quantity: 28, unit: 'SQ', unitPrice: 410.5, total: 11494 },
      { code: 'DW-04', description: 'Remove and replace water-damaged drywall, 1st floor', quantity: 640, unit: 'SF', unitPrice: 4.85, total: 3104 },
      { code: 'FL-02', description: 'Replace LVP flooring, living/dining', quantity: 420, unit: 'SF', unitPrice: 6.1, total: 2562 },
    ],
  };
}
