export interface AppEntry {
  name: string;
  displayName: string;
  icon: string;
  version: string;
  category: string;
  tags: string[];
  description: string;
  cycleId: string;
  builtAt: string;
  sourceUrl: string;
  tools: { name: string; description: string }[];
  quality: {
    judgeScore: number | null;
    judgeVerdict: string | null;
    personaPassRate: number | null;
    buildIterations: number;
    guardianPassed: boolean | null;
    testCount: number;
  };
  install: {
    workerUrl: string;
    requiresAuth: boolean;
    requiresExternalAPI?: string;
    mcpConfig: Record<string, unknown>;
  };
  status: 'active' | 'beta' | 'deprecated';
}

export interface Catalog {
  apps: AppEntry[];
  updatedAt: string | null;
}
