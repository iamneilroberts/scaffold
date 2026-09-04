import type { BlsPpiSeriesResponse } from '../sources/bls-ppi.js';

export function sampleBlsPpiResponse(): BlsPpiSeriesResponse {
  const now = new Date();
  const dataMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1); // BLS publishes ~2mo lagged
  const year = String(dataMonth.getFullYear());
  const period = `M${String(dataMonth.getMonth() + 1).padStart(2, '0')}`;
  return {
    status: 'REQUEST_SUCCEEDED',
    Results: {
      series: [{
        seriesID: 'WPU0811',
        data: [{ year, period, periodName: dataMonth.toLocaleString('en-US', { month: 'long' }), value: '312.500' }],
      }],
    },
  };
}
