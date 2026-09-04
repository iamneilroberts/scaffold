import type { OpenFemaResponse } from '../sources/openfema.js';

const iso = (deltaDays: number) => new Date(Date.now() + deltaDays * 86_400_000).toISOString();

export function sampleOpenFemaDeclarations(): OpenFemaResponse {
  return {
    DisasterDeclarationsSummaries: [{
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
    }],
  };
}
