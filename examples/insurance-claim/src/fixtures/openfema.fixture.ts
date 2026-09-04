import type { OpenFemaResponse } from '../sources/openfema.js';

const iso = (deltaDays: number) => new Date(Date.now() + deltaDays * 86_400_000).toISOString();

// A loss date inside the matching declaration's incident window (below) — use this as the
// claim context in tests so only that declaration gets treated as the coverage basis.
export const SAMPLE_LOSS_DATE = iso(-49);

export function sampleOpenFemaDeclarations(): OpenFemaResponse {
  return {
    DisasterDeclarationsSummaries: [
      {
        disasterNumber: 4812,
        state: 'FL',
        declarationType: 'DR',
        declarationDate: iso(-45),
        incidentType: 'Hurricane',
        designatedArea: 'Bay (County)',
        incidentBeginDate: iso(-52),
        incidentEndDate: iso(-48),
        ihProgramDeclared: true,
        iaProgramDeclared: true,
      },
      // A DIFFERENT disaster, a year-plus earlier — same county, but its incident window does
      // NOT contain SAMPLE_LOSS_DATE. Must never be badged/emitted as the coverage basis.
      {
        disasterNumber: 4390,
        state: 'FL',
        declarationType: 'DR',
        declarationDate: iso(-420),
        incidentType: 'Severe Storm',
        designatedArea: 'Bay (County)',
        incidentBeginDate: iso(-430),
        incidentEndDate: iso(-415),
        ihProgramDeclared: true,
        iaProgramDeclared: true,
      },
    ],
  };
}
