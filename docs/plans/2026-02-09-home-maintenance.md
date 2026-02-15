# Home Maintenance Tracker MCP Assistant — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a home maintenance assistant as a standalone Scaffold framework app that tracks home appliances and systems, logs maintenance events, calculates what's due or overdue, and provides expert guidance on recommended maintenance schedules — helping homeowners stay on top of the upkeep that prevents expensive repairs.

**Architecture:** Cloudflare Worker MCP server using `@scaffold/core`. Two entity types: appliances (HVAC, water heater, washer, etc.) and maintenance logs nested under each appliance. A shared schedule dataset defines recommended intervals per category. A quick-setup tool lets users onboard by selecting which categories they have, auto-creating standard appliances. A due-check tool cross-references last service dates against recommended intervals. User data is isolated via `{userId}/` key prefixes (defaults to 'anonymous' in no-auth mode).

**Tech Stack:** TypeScript, `@scaffold/core`, Cloudflare Workers, KV storage, Vitest

---

## Task 1: Project Scaffolding

**Files:**
- Create: `~/dev/home-maintenance/package.json`
- Create: `~/dev/home-maintenance/tsconfig.json`
- Create: `~/dev/home-maintenance/wrangler.toml`
- Create: `~/dev/home-maintenance/src/index.ts`
- Create: `~/dev/home-maintenance/src/tools.ts` (empty export placeholder)

**Step 1: Create `package.json`**

Create `~/dev/home-maintenance/package.json`:

```json
{
  "name": "home-maintenance",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@scaffold/core": "file:../scaffold/packages/core"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240512.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "wrangler": "^3.0.0"
  }
}
```

**Step 2: Create `tsconfig.json`**

Create `~/dev/home-maintenance/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Step 3: Create `wrangler.toml`**

Create `~/dev/home-maintenance/wrangler.toml`:

```toml
name = "home-maintenance"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
workers_dev = true

[vars]
ADMIN_KEY = "change-me-in-production"

[[kv_namespaces]]
binding = "DATA"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"
```

**Step 4: Create placeholder `src/tools.ts`**

Create `~/dev/home-maintenance/src/tools.ts`:

```typescript
import type { ScaffoldTool } from '@scaffold/core';

export const homeTools: ScaffoldTool[] = [];
```

**Step 5: Create `src/index.ts` (worker entry point)**

Create `~/dev/home-maintenance/src/index.ts`:

```typescript
import { ScaffoldServer, CloudflareKVAdapter, type ScaffoldConfig } from '@scaffold/core';
import { homeTools } from './tools.js';

interface Env {
  DATA: KVNamespace;
  ADMIN_KEY: string;
}

const config: ScaffoldConfig = {
  app: {
    name: 'Home Maintenance Tracker',
    description: 'Track home appliances and systems, log maintenance events, check what\u2019s due, and get expert maintenance guidance',
    version: '0.0.1',
  },
  mcp: {
    serverName: 'home-maintenance',
    protocolVersion: '2024-11-05',
  },
  auth: {
    adminKey: undefined,
    requireAuth: false,
    enableKeyIndex: false,
    enableFallbackScan: false,
    fallbackScanRateLimit: 0,
    fallbackScanBudget: 0,
  },
  admin: {
    path: '/admin',
  },
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const runtimeConfig = {
      ...config,
      auth: { ...config.auth, adminKey: env.ADMIN_KEY },
    };

    const storage = new CloudflareKVAdapter(env.DATA);
    const server = new ScaffoldServer({
      config: runtimeConfig,
      storage,
      tools: homeTools,
    });

    return server.fetch(request, env as unknown as Record<string, unknown>, ctx);
  },
};
```

**Step 6: Install dependencies**

Run: `cd ~/dev/home-maintenance && npm install`
Expected: Success, @scaffold/core linked from local path

**Step 7: Verify typecheck**

Run: `cd ~/dev/home-maintenance && npx tsc --noEmit`
Expected: No errors

**Step 8: Commit**

```bash
cd ~/dev/home-maintenance
git init
git add .
git commit -m "feat: scaffold project structure"
```

---

## Task 2: Data Types, Key Helpers, and Schedule Data

**Files:**
- Create: `~/dev/home-maintenance/src/types.ts`
- Create: `~/dev/home-maintenance/src/keys.ts`
- Create: `~/dev/home-maintenance/src/schedules.ts`

**Step 1: Create `src/types.ts`**

```typescript
export type ApplianceCategory =
  | 'hvac'
  | 'water_heater'
  | 'plumbing'
  | 'electrical'
  | 'kitchen_appliance'
  | 'laundry'
  | 'exterior'
  | 'roofing'
  | 'safety'
  | 'garage'
  | 'other';

export interface Appliance {
  id: string;
  name: string;                    // "Carrier Central AC", "GE Dishwasher"
  category: ApplianceCategory;
  brand?: string;
  model?: string;
  installDate?: string;            // ISO 8601
  location?: string;               // "basement", "kitchen", "garage"
  warrantyExpires?: string;        // ISO 8601
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type MaintenanceEventType =
  | 'routine'
  | 'repair'
  | 'inspection'
  | 'replacement'
  | 'professional_service'
  | 'cleaning'
  | 'note';

export interface MaintenanceLog {
  id: string;
  applianceId: string;
  date: string;                    // ISO 8601 — when the maintenance was performed
  eventType: MaintenanceEventType;
  description: string;
  cost?: number;                   // dollars
  provider?: string;               // "DIY", "Bob's HVAC", etc.
  notes?: string;
  createdAt: string;
}
```

**Step 2: Create `src/keys.ts`**

```typescript
// Per-user appliances
export function applianceKey(userId: string, applianceId: string): string {
  return `${userId}/appliances/${applianceId}`;
}

export function appliancesPrefix(userId: string): string {
  return `${userId}/appliances/`;
}

// Maintenance logs nested under appliance
export function logKey(userId: string, applianceId: string, logId: string): string {
  return `${userId}/appliances/${applianceId}/logs/${logId}`;
}

export function logsPrefix(userId: string, applianceId: string): string {
  return `${userId}/appliances/${applianceId}/logs/`;
}

// ID generator
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
```

**Step 3: Create `src/schedules.ts`**

This is the embedded expert knowledge — recommended maintenance tasks by appliance category.

```typescript
import type { ApplianceCategory } from './types.js';

export interface MaintenanceTask {
  name: string;
  intervalDays: number;
  description: string;
  difficulty: 'easy' | 'moderate' | 'professional';
  estimatedCost?: string;
  seasonal?: string;
}

export interface CategorySchedule {
  category: ApplianceCategory;
  displayName: string;
  commonItems: string[];
  tasks: MaintenanceTask[];
  tips: string[];
}

export const SCHEDULES: CategorySchedule[] = [
  {
    category: 'hvac',
    displayName: 'HVAC (Heating, Ventilation & Air Conditioning)',
    commonItems: ['Central AC', 'Furnace', 'Heat Pump', 'Mini Split'],
    tasks: [
      { name: 'Replace air filter', intervalDays: 90, description: 'Replace or clean HVAC air filter. Dirty filters reduce efficiency 5-15% and strain the system.', difficulty: 'easy', estimatedCost: '$5-$30' },
      { name: 'Professional tune-up', intervalDays: 182, description: 'Professional HVAC service: check refrigerant, clean coils, inspect electrical, test safety controls.', difficulty: 'professional', estimatedCost: '$75-$200', seasonal: 'spring (AC) / fall (heat)' },
      { name: 'Clean condensate drain', intervalDays: 182, description: 'Flush condensate drain line with vinegar to prevent clogs and water damage.', difficulty: 'easy' },
      { name: 'Duct cleaning', intervalDays: 1825, description: 'Professional duct cleaning every 3-5 years, or sooner if you notice dust/odors.', difficulty: 'professional', estimatedCost: '$300-$500' },
    ],
    tips: [
      'Change filters more often if you have pets or allergies (every 30-60 days)',
      'Keep 2 feet of clearance around outdoor units',
      'Programmable thermostat can save 10% on heating/cooling costs',
    ],
  },
  {
    category: 'water_heater',
    displayName: 'Water Heater',
    commonItems: ['Tank Water Heater', 'Tankless Water Heater'],
    tasks: [
      { name: 'Flush tank', intervalDays: 365, description: 'Drain and flush sediment from tank. Sediment buildup reduces efficiency and shortens lifespan.', difficulty: 'moderate', estimatedCost: 'Free (DIY)' },
      { name: 'Test T&P relief valve', intervalDays: 365, description: 'Lift the lever on the temperature and pressure relief valve to verify it operates. This is a critical safety device.', difficulty: 'easy' },
      { name: 'Check anode rod', intervalDays: 1095, description: 'Inspect sacrificial anode rod every 2-3 years. Replace if more than 50% depleted. This prevents tank corrosion.', difficulty: 'moderate', estimatedCost: '$20-$50' },
      { name: 'Professional inspection', intervalDays: 365, description: 'Annual professional check of all connections, venting, and operation.', difficulty: 'professional', estimatedCost: '$100-$150' },
    ],
    tips: [
      'Set temperature to 120\u00b0F \u2014 prevents scalding and saves energy',
      'Tank water heaters last 8-12 years; tankless last 15-20 years',
      'If you hear popping/rumbling, the tank needs flushing (sediment buildup)',
    ],
  },
  {
    category: 'plumbing',
    displayName: 'Plumbing',
    commonItems: ['Main Water Line', 'Water Softener', 'Sump Pump', 'Septic System'],
    tasks: [
      { name: 'Check for leaks', intervalDays: 90, description: 'Inspect under sinks, around toilets, and near water heater for drips or moisture.', difficulty: 'easy' },
      { name: 'Drain cleaning', intervalDays: 365, description: 'Preventive drain cleaning for slow drains. Use enzyme cleaner, not chemical drain openers.', difficulty: 'easy', estimatedCost: '$10-$15' },
      { name: 'Test sump pump', intervalDays: 90, description: 'Pour water into sump pit to verify pump activates and drains properly.', difficulty: 'easy' },
      { name: 'Water softener maintenance', intervalDays: 30, description: 'Check salt level and add salt as needed. Clean brine tank annually.', difficulty: 'easy', estimatedCost: '$5-$10/month' },
      { name: 'Septic tank pump', intervalDays: 1095, description: 'Professional septic tank pumping every 3-5 years depending on household size.', difficulty: 'professional', estimatedCost: '$300-$600' },
    ],
    tips: [
      'Know where your main water shutoff valve is before you need it',
      'Never pour grease down drains \u2014 it solidifies and causes clogs',
      'Insulate exposed pipes in winter to prevent freezing',
    ],
  },
  {
    category: 'electrical',
    displayName: 'Electrical',
    commonItems: ['Electrical Panel', 'Generator', 'Whole-House Surge Protector'],
    tasks: [
      { name: 'Test GFCI outlets', intervalDays: 30, description: 'Press test/reset buttons on GFCI outlets in kitchens, bathrooms, and outdoor areas.', difficulty: 'easy' },
      { name: 'Panel inspection', intervalDays: 365, description: 'Visual inspection: look for scorch marks, unusual sounds, or tripped breakers. Professional inspection recommended.', difficulty: 'professional', estimatedCost: '$100-$200' },
      { name: 'Generator maintenance', intervalDays: 182, description: 'Run generator under load for 30 min, check oil, test transfer switch.', difficulty: 'moderate' },
    ],
    tips: [
      'Never ignore a frequently tripping breaker \u2014 it\u2019s a warning sign',
      'Aluminum wiring (pre-1972 homes) needs professional evaluation',
      'Surge protectors have a lifespan \u2014 replace every 3-5 years',
    ],
  },
  {
    category: 'kitchen_appliance',
    displayName: 'Kitchen Appliances',
    commonItems: ['Refrigerator', 'Dishwasher', 'Oven/Range', 'Microwave', 'Garbage Disposal'],
    tasks: [
      { name: 'Clean refrigerator coils', intervalDays: 182, description: 'Vacuum or brush condenser coils (usually underneath or behind). Dirty coils make the fridge work harder and use more energy.', difficulty: 'easy' },
      { name: 'Clean dishwasher filter', intervalDays: 30, description: 'Remove and clean the bottom filter. Buildup causes poor cleaning and odors.', difficulty: 'easy' },
      { name: 'Deep clean oven', intervalDays: 90, description: 'Clean oven interior. Use self-clean cycle or manual cleaning with baking soda paste.', difficulty: 'easy' },
      { name: 'Clean range hood filter', intervalDays: 90, description: 'Soak metal range hood filters in hot soapy water or run through dishwasher.', difficulty: 'easy' },
      { name: 'Refresh garbage disposal', intervalDays: 30, description: 'Clean with ice cubes and rock salt, then freshen with citrus peels.', difficulty: 'easy' },
    ],
    tips: [
      'Keep refrigerator between 35-38\u00b0F, freezer at 0\u00b0F',
      'Run dishwasher with a cup of vinegar (empty) monthly to clean spray arms',
      'Never put fibrous foods (celery, corn husks) in the garbage disposal',
    ],
  },
  {
    category: 'laundry',
    displayName: 'Laundry',
    commonItems: ['Washing Machine', 'Dryer'],
    tasks: [
      { name: 'Clean washing machine', intervalDays: 30, description: 'Run empty hot cycle with washing machine cleaner or 2 cups white vinegar. Wipe door gasket.', difficulty: 'easy', estimatedCost: '$3-$5' },
      { name: 'Clean dryer vent', intervalDays: 365, description: 'Disconnect and clean entire dryer vent duct from dryer to exterior. FIRE HAZARD if neglected \u2014 dryer fires cause $200M+ in damage annually.', difficulty: 'moderate', estimatedCost: '$100-$150 (pro) or free (DIY)' },
      { name: 'Clean dryer lint trap housing', intervalDays: 90, description: 'Remove lint trap and vacuum the housing. Dryer sheet residue builds up and restricts airflow.', difficulty: 'easy' },
      { name: 'Inspect washer hoses', intervalDays: 730, description: 'Check washing machine hoses for bulges, cracks, or wear. Replace with braided stainless steel hoses.', difficulty: 'moderate', estimatedCost: '$15-$25' },
    ],
    tips: [
      'Dryer vent cleaning is the #1 most overlooked maintenance item \u2014 do not skip this',
      'Leave washer door open between loads to prevent mold (front-loaders especially)',
      'Don\u2019t overload \u2014 it strains bearings and the motor',
    ],
  },
  {
    category: 'exterior',
    displayName: 'Exterior & Grounds',
    commonItems: ['Gutters', 'Deck/Patio', 'Fence', 'Driveway', 'Irrigation System'],
    tasks: [
      { name: 'Clean gutters', intervalDays: 182, description: 'Remove debris from gutters and downspouts. Check for proper drainage away from foundation.', difficulty: 'moderate', seasonal: 'spring / fall' },
      { name: 'Power wash exterior', intervalDays: 365, description: 'Power wash siding, driveway, walkways, and deck/patio.', difficulty: 'moderate', estimatedCost: '$100-$300 (pro) or $50 (rental)' },
      { name: 'Seal/stain deck', intervalDays: 1095, description: 'Apply sealant or stain to wood deck every 2-3 years to prevent rot and UV damage.', difficulty: 'moderate', estimatedCost: '$50-$150 (DIY)' },
      { name: 'Winterize irrigation', intervalDays: 365, description: 'Blow out irrigation lines before first freeze. Turn off outdoor water supply.', difficulty: 'moderate', seasonal: 'fall' },
      { name: 'Check caulking/weatherstripping', intervalDays: 365, description: 'Inspect and replace caulking around windows, doors, and exterior penetrations.', difficulty: 'easy', estimatedCost: '$10-$30', seasonal: 'fall' },
    ],
    tips: [
      'Gutters are the #1 defense against foundation damage \u2014 keep them clear',
      'Grade soil away from foundation (6 inches drop over 10 feet)',
      'Trim trees/shrubs 3+ feet from house to prevent moisture and pest issues',
    ],
  },
  {
    category: 'roofing',
    displayName: 'Roofing',
    commonItems: ['Asphalt Shingle Roof', 'Metal Roof', 'Flat Roof'],
    tasks: [
      { name: 'Visual roof inspection', intervalDays: 182, description: 'Inspect from ground with binoculars: look for missing/damaged shingles, flashing issues, sagging.', difficulty: 'easy', seasonal: 'spring / fall' },
      { name: 'Professional roof inspection', intervalDays: 365, description: 'Professional inspection of shingles, flashing, vents, and structural integrity.', difficulty: 'professional', estimatedCost: '$150-$400' },
      { name: 'Check attic for leaks', intervalDays: 182, description: 'Inspect attic for daylight through roof, water stains, or mold after heavy rain.', difficulty: 'easy' },
    ],
    tips: [
      'Asphalt shingle roofs last 20-30 years; metal roofs last 40-70 years',
      'After major storms, do a visual check for damage',
      'Moss/algae growth holds moisture \u2014 treat with zinc strips or professional cleaning',
    ],
  },
  {
    category: 'safety',
    displayName: 'Safety Systems',
    commonItems: ['Smoke Detectors', 'CO Detectors', 'Fire Extinguishers', 'Security System'],
    tasks: [
      { name: 'Test smoke detectors', intervalDays: 30, description: 'Press test button on every smoke detector. Everyone in the house should know the sound.', difficulty: 'easy' },
      { name: 'Replace smoke detector batteries', intervalDays: 182, description: 'Replace batteries in all smoke and CO detectors, even if they haven\u2019t chirped.', difficulty: 'easy', estimatedCost: '$5-$15' },
      { name: 'Replace smoke detectors', intervalDays: 3650, description: 'Smoke detectors expire after 10 years. Check manufacture date on back.', difficulty: 'easy', estimatedCost: '$15-$30 each' },
      { name: 'Replace CO detectors', intervalDays: 2555, description: 'CO detectors expire after 5-7 years. Replace entire unit.', difficulty: 'easy', estimatedCost: '$20-$40 each' },
      { name: 'Check fire extinguishers', intervalDays: 365, description: 'Verify pressure gauge is in green zone, pin is intact, no visible damage. Replace if expired.', difficulty: 'easy' },
    ],
    tips: [
      'Smoke detectors on every level, inside every bedroom, and outside sleeping areas',
      'CO detectors required near bedrooms and on every level with fuel-burning appliances',
      'Have a fire escape plan and practice it with household members',
    ],
  },
  {
    category: 'garage',
    displayName: 'Garage',
    commonItems: ['Garage Door Opener', 'Garage Door'],
    tasks: [
      { name: 'Lubricate garage door', intervalDays: 182, description: 'Apply garage door lubricant (not WD-40) to hinges, rollers, springs, and tracks.', difficulty: 'easy', estimatedCost: '$5-$10' },
      { name: 'Test safety reverse', intervalDays: 30, description: 'Place a 2x4 flat under the door and close it. Door must reverse on contact.', difficulty: 'easy' },
      { name: 'Test photo eye sensors', intervalDays: 30, description: 'Wave an object through the sensor beam while door is closing. Door must reverse.', difficulty: 'easy' },
      { name: 'Replace springs', intervalDays: 3650, description: 'Garage door springs last 7-10 years (10,000 cycles). ALWAYS hire a professional \u2014 springs under extreme tension are dangerous.', difficulty: 'professional', estimatedCost: '$150-$350' },
    ],
    tips: [
      'NEVER attempt to repair or replace garage door springs yourself \u2014 they can cause serious injury',
      'If the door is hard to lift manually, springs may be failing',
      'Keep the photo eye sensors clean and aligned',
    ],
  },
];

/** Get schedule for a specific category */
export function getSchedule(category: ApplianceCategory): CategorySchedule | undefined {
  return SCHEDULES.find(s => s.category === category);
}

/** Get all category names for display */
export function getCategoryNames(): Array<{ category: ApplianceCategory; displayName: string }> {
  return SCHEDULES.map(s => ({ category: s.category, displayName: s.displayName }));
}
```

**Step 4: Verify typecheck**

Run: `cd ~/dev/home-maintenance && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
cd ~/dev/home-maintenance
git add src/types.ts src/keys.ts src/schedules.ts
git commit -m "feat: add data types, KV key helpers, and maintenance schedule data"
```

---

## Task 3: Appliance Management Tools (add, get, list, remove, quick_setup)

**Files:**
- Create: `~/dev/home-maintenance/src/__tests__/appliance-tools.test.ts`
- Create: `~/dev/home-maintenance/src/tools/appliance-tools.ts`

**Step 1: Write the failing tests**

Create `~/dev/home-maintenance/src/__tests__/appliance-tools.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@scaffold/core';
import type { ToolContext } from '@scaffold/core';
import {
  addApplianceTool,
  getApplianceTool,
  listAppliancesTool,
  removeApplianceTool,
  quickSetupTool,
} from '../tools/appliance-tools.js';

function makeCtx(storage: InMemoryAdapter, userId = 'user1'): ToolContext {
  return {
    authKeyHash: 'test-key-hash',
    userId,
    isAdmin: false,
    storage,
    env: {},
    debugMode: false,
    requestId: 'req-1',
  };
}

function extractId(text: string): string {
  const match = text.match(/\(([a-z0-9]+)\)/);
  return match?.[1] ?? '';
}

describe('appliance management tools', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
  });

  it('adds an appliance and retrieves it', async () => {
    const result = await addApplianceTool.handler(
      { name: 'Carrier Central AC', category: 'hvac', brand: 'Carrier', model: '24ACC636A003', location: 'exterior' },
      ctx,
    );
    expect(result.content[0]!.text).toContain('Carrier Central AC');
    const id = extractId(result.content[0]!.text!);
    expect(id).toBeTruthy();

    const getResult = await getApplianceTool.handler({ applianceId: id }, ctx);
    const appliance = JSON.parse(getResult.content[0]!.text!);
    expect(appliance.name).toBe('Carrier Central AC');
    expect(appliance.category).toBe('hvac');
    expect(appliance.brand).toBe('Carrier');
    expect(appliance.logs).toEqual([]);
  });

  it('lists appliances', async () => {
    await addApplianceTool.handler(
      { name: 'Central AC', category: 'hvac' },
      ctx,
    );
    await addApplianceTool.handler(
      { name: 'Water Heater', category: 'water_heater' },
      ctx,
    );

    const result = await listAppliancesTool.handler({}, ctx);
    expect(result.content[0]!.text).toContain('Central AC');
    expect(result.content[0]!.text).toContain('Water Heater');
  });

  it('returns empty message when no appliances exist', async () => {
    const result = await listAppliancesTool.handler({}, ctx);
    expect(result.content[0]!.text).toContain('No appliance');
  });

  it('removes an appliance', async () => {
    const createResult = await addApplianceTool.handler(
      { name: 'Old Washer', category: 'laundry' },
      ctx,
    );
    const id = extractId(createResult.content[0]!.text!);

    const removeResult = await removeApplianceTool.handler({ applianceId: id }, ctx);
    expect(removeResult.content[0]!.text).toContain('Removed');

    const getResult = await getApplianceTool.handler({ applianceId: id }, ctx);
    expect(getResult.isError).toBe(true);
  });

  it('returns error when getting non-existent appliance', async () => {
    const result = await getApplianceTool.handler({ applianceId: 'nope' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('returns error when removing non-existent appliance', async () => {
    const result = await removeApplianceTool.handler({ applianceId: 'nope' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('isolates appliances between users', async () => {
    const ctx2 = makeCtx(storage, 'user2');
    await addApplianceTool.handler({ name: 'My AC', category: 'hvac' }, ctx);
    await addApplianceTool.handler({ name: 'Their Furnace', category: 'hvac' }, ctx2);

    const r1 = await listAppliancesTool.handler({}, ctx);
    const r2 = await listAppliancesTool.handler({}, ctx2);
    expect(r1.content[0]!.text).toContain('My AC');
    expect(r1.content[0]!.text).not.toContain('Their Furnace');
    expect(r2.content[0]!.text).toContain('Their Furnace');
    expect(r2.content[0]!.text).not.toContain('My AC');
  });

  describe('quick setup', () => {
    it('creates appliances from category defaults', async () => {
      const result = await quickSetupTool.handler(
        { categories: ['hvac', 'safety'] },
        ctx,
      );
      const text = result.content[0]!.text!;
      expect(text).toContain('Central AC');
      expect(text).toContain('Furnace');
      expect(text).toContain('Smoke Detectors');

      const listResult = await listAppliancesTool.handler({}, ctx);
      const listText = listResult.content[0]!.text!;
      expect(listText).toContain('Central AC');
      expect(listText).toContain('Smoke Detectors');
    });

    it('returns error for invalid category', async () => {
      const result = await quickSetupTool.handler(
        { categories: ['spaceship'] },
        ctx,
      );
      expect(result.isError).toBe(true);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd ~/dev/home-maintenance && npx vitest run src/__tests__/appliance-tools.test.ts`
Expected: FAIL — module `../tools/appliance-tools.js` does not exist

**Step 3: Implement appliance tools**

Create `~/dev/home-maintenance/src/tools/appliance-tools.ts`:

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@scaffold/core';
import type { Appliance, MaintenanceLog, ApplianceCategory } from '../types.js';
import { applianceKey, appliancesPrefix, logsPrefix, generateId } from '../keys.js';
import { SCHEDULES, getSchedule } from '../schedules.js';

export const addApplianceTool: ScaffoldTool = {
  name: 'home:add_appliance',
  description: `Add a home appliance or system to track. Categories: hvac, water_heater, plumbing, electrical, kitchen_appliance, laundry, exterior, roofing, safety, garage, other.
Use home:quick_setup to batch-add common items for multiple categories at once.`,
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Appliance name (e.g., "Carrier Central AC", "Samsung Washer")' },
      category: {
        type: 'string',
        enum: ['hvac', 'water_heater', 'plumbing', 'electrical', 'kitchen_appliance', 'laundry', 'exterior', 'roofing', 'safety', 'garage', 'other'],
        description: 'Appliance category',
      },
      brand: { type: 'string', description: 'Brand name' },
      model: { type: 'string', description: 'Model number' },
      installDate: { type: 'string', description: 'Installation date (ISO 8601)' },
      location: { type: 'string', description: 'Location in home (e.g., "basement", "kitchen", "garage")' },
      warrantyExpires: { type: 'string', description: 'Warranty expiration date (ISO 8601)' },
      notes: { type: 'string', description: 'Additional notes' },
    },
    required: ['name', 'category'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const params = input as {
      name: string; category: ApplianceCategory; brand?: string; model?: string;
      installDate?: string; location?: string; warrantyExpires?: string; notes?: string;
    };
    const id = generateId();
    const now = new Date().toISOString();

    const appliance: Appliance = {
      id,
      name: params.name,
      category: params.category,
      brand: params.brand,
      model: params.model,
      installDate: params.installDate,
      location: params.location,
      warrantyExpires: params.warrantyExpires,
      notes: params.notes,
      createdAt: now,
      updatedAt: now,
    };

    await ctx.storage.put(applianceKey(ctx.userId, id), appliance);

    const schedule = getSchedule(params.category);
    const taskCount = schedule ? schedule.tasks.length : 0;

    return {
      content: [{
        type: 'text',
        text: `Added "${params.name}" (${id}) [${params.category}]${params.location ? ` in ${params.location}` : ''}. ${taskCount > 0 ? `${taskCount} recommended maintenance tasks tracked for this category.` : ''} Use home:log_maintenance to record service events.`,
      }],
    };
  },
};

export const getApplianceTool: ScaffoldTool = {
  name: 'home:get_appliance',
  description: 'Get full details of a tracked appliance including its maintenance history.',
  inputSchema: {
    type: 'object',
    properties: {
      applianceId: { type: 'string', description: 'Appliance ID' },
    },
    required: ['applianceId'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { applianceId } = input as { applianceId: string };
    const appliance = await ctx.storage.get<Appliance>(applianceKey(ctx.userId, applianceId));

    if (!appliance) {
      return { content: [{ type: 'text', text: `Appliance "${applianceId}" not found.` }], isError: true };
    }

    const logsList = await ctx.storage.list(logsPrefix(ctx.userId, applianceId));
    const logs: MaintenanceLog[] = [];
    for (const key of logsList.keys) {
      const log = await ctx.storage.get<MaintenanceLog>(key);
      if (log) logs.push(log);
    }
    logs.sort((a, b) => b.date.localeCompare(a.date));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ ...appliance, logs }, null, 2),
      }],
    };
  },
};

export const listAppliancesTool: ScaffoldTool = {
  name: 'home:list_appliances',
  description: 'List all tracked home appliances and systems.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const prefix = appliancesPrefix(ctx.userId);
    const result = await ctx.storage.list(prefix);

    const applianceKeys = result.keys.filter(k => {
      const rel = k.slice(prefix.length);
      return !rel.includes('/');
    });

    if (applianceKeys.length === 0) {
      return { content: [{ type: 'text', text: 'No appliances tracked yet. Use home:add_appliance to add one, or home:quick_setup to add common items.' }] };
    }

    const appliances: Appliance[] = [];
    for (const key of applianceKeys) {
      const appliance = await ctx.storage.get<Appliance>(key);
      if (appliance) appliances.push(appliance);
    }

    const summary = appliances
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
      .map(a => {
        const loc = a.location ? ` [${a.location}]` : '';
        const brand = a.brand ? ` (${a.brand})` : '';
        return `- **${a.name}**${brand} (${a.id}) \u2014 ${a.category}${loc}`;
      })
      .join('\n');

    return { content: [{ type: 'text', text: `${applianceKeys.length} appliance(s):\n${summary}` }] };
  },
};

export const removeApplianceTool: ScaffoldTool = {
  name: 'home:remove_appliance',
  description: 'Remove a tracked appliance and all its maintenance logs.',
  inputSchema: {
    type: 'object',
    properties: {
      applianceId: { type: 'string', description: 'Appliance ID' },
    },
    required: ['applianceId'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { applianceId } = input as { applianceId: string };
    const appliance = await ctx.storage.get<Appliance>(applianceKey(ctx.userId, applianceId));

    if (!appliance) {
      return { content: [{ type: 'text', text: `Appliance "${applianceId}" not found.` }], isError: true };
    }

    // Delete all maintenance logs
    const logsList = await ctx.storage.list(logsPrefix(ctx.userId, applianceId));
    for (const key of logsList.keys) {
      await ctx.storage.delete(key);
    }

    // Delete the appliance
    await ctx.storage.delete(applianceKey(ctx.userId, applianceId));

    return {
      content: [{
        type: 'text',
        text: `Removed "${appliance.name}" and ${logsList.keys.length} maintenance log(s).`,
      }],
    };
  },
};

export const quickSetupTool: ScaffoldTool = {
  name: 'home:quick_setup',
  description: `Quickly add common home appliances by category. Creates standard items for each selected category.
Available categories: hvac, water_heater, plumbing, electrical, kitchen_appliance, laundry, exterior, roofing, safety, garage.
Example: categories ["hvac", "kitchen_appliance", "laundry", "safety"] creates Central AC, Furnace, Refrigerator, Dishwasher, Oven, Washer, Dryer, Smoke Detectors, etc.`,
  inputSchema: {
    type: 'object',
    properties: {
      categories: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of appliance categories to set up',
      },
    },
    required: ['categories'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { categories } = input as { categories: string[] };
    const created: string[] = [];
    const errors: string[] = [];

    for (const cat of categories) {
      const schedule = getSchedule(cat as ApplianceCategory);
      if (!schedule) {
        errors.push(cat);
        continue;
      }

      for (const itemName of schedule.commonItems) {
        const id = generateId();
        const now = new Date().toISOString();

        const appliance: Appliance = {
          id,
          name: itemName,
          category: cat as ApplianceCategory,
          createdAt: now,
          updatedAt: now,
        };

        await ctx.storage.put(applianceKey(ctx.userId, id), appliance);
        created.push(`${itemName} (${id}) [${cat}]`);
      }
    }

    if (errors.length > 0 && created.length === 0) {
      return {
        content: [{ type: 'text', text: `Unknown categories: ${errors.join(', ')}. Use home:maintenance_guide to see available categories.` }],
        isError: true,
      };
    }

    let text = `Set up ${created.length} appliance(s):\n${created.map(c => `- ${c}`).join('\n')}`;
    if (errors.length > 0) {
      text += `\n\nSkipped unknown categories: ${errors.join(', ')}`;
    }
    text += '\n\nUse home:check_due to see recommended maintenance for these items.';

    return { content: [{ type: 'text', text }] };
  },
};
```

**Step 4: Run tests to verify they pass**

Run: `cd ~/dev/home-maintenance && npx vitest run src/__tests__/appliance-tools.test.ts`
Expected: All 8 tests PASS

**Step 5: Commit**

```bash
cd ~/dev/home-maintenance
git add src/tools/appliance-tools.ts src/__tests__/appliance-tools.test.ts
git commit -m "feat: appliance management tools (add, get, list, remove, quick_setup)"
```

---

## Task 4: Maintenance Logging Tool

**Files:**
- Create: `~/dev/home-maintenance/src/__tests__/log-tools.test.ts`
- Create: `~/dev/home-maintenance/src/tools/log-tools.ts`

**Step 1: Write the failing tests**

Create `~/dev/home-maintenance/src/__tests__/log-tools.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@scaffold/core';
import type { ToolContext } from '@scaffold/core';
import { addApplianceTool, getApplianceTool } from '../tools/appliance-tools.js';
import { logMaintenanceTool } from '../tools/log-tools.js';

function makeCtx(storage: InMemoryAdapter, userId = 'user1'): ToolContext {
  return {
    authKeyHash: 'test-key-hash',
    userId,
    isAdmin: false,
    storage,
    env: {},
    debugMode: false,
    requestId: 'req-1',
  };
}

function extractId(text: string): string {
  const match = text.match(/\(([a-z0-9]+)\)/);
  return match?.[1] ?? '';
}

describe('maintenance logging tools', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;
  let applianceId: string;

  beforeEach(async () => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
    const result = await addApplianceTool.handler(
      { name: 'Central AC', category: 'hvac' },
      ctx,
    );
    applianceId = extractId(result.content[0]!.text!);
  });

  it('logs a routine maintenance event', async () => {
    const result = await logMaintenanceTool.handler(
      { applianceId, eventType: 'routine', description: 'Replaced air filter' },
      ctx,
    );
    expect(result.content[0]!.text).toContain('routine');
    expect(result.content[0]!.text).toContain('Replaced air filter');
  });

  it('logs a repair with cost and provider', async () => {
    const result = await logMaintenanceTool.handler(
      { applianceId, eventType: 'repair', description: 'Replaced capacitor', cost: 285, provider: 'Cool Air HVAC' },
      ctx,
    );
    expect(result.content[0]!.text).toContain('$285');
    expect(result.content[0]!.text).toContain('Cool Air HVAC');
  });

  it('logs appear in appliance details', async () => {
    await logMaintenanceTool.handler(
      { applianceId, eventType: 'routine', description: 'Replaced filter' },
      ctx,
    );
    await logMaintenanceTool.handler(
      { applianceId, eventType: 'inspection', description: 'Annual tune-up' },
      ctx,
    );

    const getResult = await getApplianceTool.handler({ applianceId }, ctx);
    const appliance = JSON.parse(getResult.content[0]!.text!);
    expect(appliance.logs).toHaveLength(2);
  });

  it('accepts a custom date', async () => {
    const result = await logMaintenanceTool.handler(
      { applianceId, eventType: 'routine', description: 'Filter change', date: '2024-06-15T00:00:00.000Z' },
      ctx,
    );
    expect(result.content[0]!.text).toContain('routine');
  });

  it('returns error for non-existent appliance', async () => {
    const result = await logMaintenanceTool.handler(
      { applianceId: 'nope', eventType: 'routine', description: 'test' },
      ctx,
    );
    expect(result.isError).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd ~/dev/home-maintenance && npx vitest run src/__tests__/log-tools.test.ts`
Expected: FAIL — module `../tools/log-tools.js` does not exist

**Step 3: Implement log tool**

Create `~/dev/home-maintenance/src/tools/log-tools.ts`:

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@scaffold/core';
import type { Appliance, MaintenanceLog, MaintenanceEventType } from '../types.js';
import { applianceKey, logKey, generateId } from '../keys.js';

export const logMaintenanceTool: ScaffoldTool = {
  name: 'home:log_maintenance',
  description: `Log a maintenance event for an appliance. Event types: routine (filter change, cleaning), repair (fixing something broken), inspection (professional check), replacement (new part/unit), professional_service (hired pro), cleaning, note (general note).
Include cost and provider to track spending. Date defaults to now but can be backdated.`,
  inputSchema: {
    type: 'object',
    properties: {
      applianceId: { type: 'string', description: 'Appliance ID' },
      eventType: {
        type: 'string',
        enum: ['routine', 'repair', 'inspection', 'replacement', 'professional_service', 'cleaning', 'note'],
        description: 'Type of maintenance event',
      },
      description: { type: 'string', description: 'What was done' },
      date: { type: 'string', description: 'When the maintenance was performed (ISO 8601, defaults to now)' },
      cost: { type: 'number', description: 'Cost in dollars' },
      provider: { type: 'string', description: 'Who did the work (e.g., "DIY", "Bob\'s HVAC")' },
      notes: { type: 'string', description: 'Additional notes' },
    },
    required: ['applianceId', 'eventType', 'description'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const params = input as {
      applianceId: string; eventType: MaintenanceEventType; description: string;
      date?: string; cost?: number; provider?: string; notes?: string;
    };

    const appliance = await ctx.storage.get<Appliance>(applianceKey(ctx.userId, params.applianceId));
    if (!appliance) {
      return { content: [{ type: 'text', text: `Appliance "${params.applianceId}" not found.` }], isError: true };
    }

    const id = generateId();
    const now = new Date().toISOString();

    const log: MaintenanceLog = {
      id,
      applianceId: params.applianceId,
      date: params.date || now,
      eventType: params.eventType,
      description: params.description,
      cost: params.cost,
      provider: params.provider,
      notes: params.notes,
      createdAt: now,
    };

    await ctx.storage.put(logKey(ctx.userId, params.applianceId, id), log);

    // Update appliance timestamp
    appliance.updatedAt = now;
    await ctx.storage.put(applianceKey(ctx.userId, params.applianceId), appliance);

    const parts = [`Logged ${params.eventType} for "${appliance.name}": ${params.description}`];
    if (params.cost) parts.push(`Cost: $${params.cost}`);
    if (params.provider) parts.push(`By: ${params.provider}`);

    return { content: [{ type: 'text', text: parts.join(' | ') }] };
  },
};
```

**Step 4: Run tests to verify they pass**

Run: `cd ~/dev/home-maintenance && npx vitest run src/__tests__/log-tools.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
cd ~/dev/home-maintenance
git add src/tools/log-tools.ts src/__tests__/log-tools.test.ts
git commit -m "feat: maintenance logging tool with cost and provider tracking"
```

---

## Task 5: Maintenance Guide Tool

**Files:**
- Create: `~/dev/home-maintenance/src/__tests__/guide-tools.test.ts`
- Create: `~/dev/home-maintenance/src/tools/guide-tools.ts`

**Step 1: Write the failing tests**

Create `~/dev/home-maintenance/src/__tests__/guide-tools.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@scaffold/core';
import type { ToolContext } from '@scaffold/core';
import { maintenanceGuideTool } from '../tools/guide-tools.js';

function makeCtx(storage: InMemoryAdapter, userId = 'user1'): ToolContext {
  return {
    authKeyHash: 'test-key-hash',
    userId,
    isAdmin: false,
    storage,
    env: {},
    debugMode: false,
    requestId: 'req-1',
  };
}

describe('maintenance guide tool', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
  });

  it('returns guide for hvac', async () => {
    const result = await maintenanceGuideTool.handler({ category: 'hvac' }, ctx);
    const text = result.content[0]!.text!;
    expect(text).toContain('HVAC');
    expect(text).toContain('air filter');
    expect(text).toContain('90');
  });

  it('returns guide for safety', async () => {
    const result = await maintenanceGuideTool.handler({ category: 'safety' }, ctx);
    expect(result.content[0]!.text).toContain('smoke');
  });

  it('returns guide for water_heater', async () => {
    const result = await maintenanceGuideTool.handler({ category: 'water_heater' }, ctx);
    expect(result.content[0]!.text).toContain('flush');
  });

  it('returns all categories when no category specified', async () => {
    const result = await maintenanceGuideTool.handler({}, ctx);
    const text = result.content[0]!.text!;
    expect(text).toContain('HVAC');
    expect(text).toContain('Water Heater');
    expect(text).toContain('Safety');
    expect(text).toContain('Laundry');
  });

  it('returns helpful message for unknown category', async () => {
    const result = await maintenanceGuideTool.handler({ category: 'spaceship' }, ctx);
    expect(result.content[0]!.text).toContain('don\'t have');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd ~/dev/home-maintenance && npx vitest run src/__tests__/guide-tools.test.ts`
Expected: FAIL — module `../tools/guide-tools.js` does not exist

**Step 3: Implement guide tool**

Create `~/dev/home-maintenance/src/tools/guide-tools.ts`:

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@scaffold/core';
import type { ApplianceCategory } from '../types.js';
import { SCHEDULES, getSchedule } from '../schedules.js';
import type { CategorySchedule } from '../schedules.js';

function formatSchedule(schedule: CategorySchedule): string {
  let text = `## ${schedule.displayName}\n\n`;

  text += '**Recommended Maintenance:**\n';
  for (const task of schedule.tasks) {
    const interval = task.intervalDays < 60
      ? `every ${task.intervalDays} days`
      : task.intervalDays < 365
        ? `every ${Math.round(task.intervalDays / 30)} months`
        : task.intervalDays === 365
          ? 'annually'
          : `every ${Math.round(task.intervalDays / 365)} years`;

    text += `- **${task.name}** (${interval}) \u2014 ${task.description}`;
    if (task.difficulty !== 'easy') text += ` [${task.difficulty}]`;
    if (task.estimatedCost) text += ` ~${task.estimatedCost}`;
    if (task.seasonal) text += ` (${task.seasonal})`;
    text += '\n';
  }

  if (schedule.tips.length > 0) {
    text += '\n**Tips:**\n';
    for (const tip of schedule.tips) {
      text += `- ${tip}\n`;
    }
  }

  text += `\n**Common items:** ${schedule.commonItems.join(', ')}\n`;

  return text;
}

export const maintenanceGuideTool: ScaffoldTool = {
  name: 'home:maintenance_guide',
  description: `Look up recommended maintenance schedules and expert tips for a home system category. Categories: hvac, water_heater, plumbing, electrical, kitchen_appliance, laundry, exterior, roofing, safety, garage. Call with no arguments to see all categories.`,
  inputSchema: {
    type: 'object',
    properties: {
      category: { type: 'string', description: 'Appliance category to look up (optional \u2014 omit for all)' },
    },
  },
  handler: async (input: unknown, _ctx: ToolContext): Promise<ToolResult> => {
    const { category } = (input as { category?: string }) || {};

    if (!category) {
      const all = SCHEDULES.map(formatSchedule).join('\n---\n\n');
      return { content: [{ type: 'text', text: all }] };
    }

    const schedule = getSchedule(category as ApplianceCategory);

    if (!schedule) {
      const available = SCHEDULES.map(s => s.category).join(', ');
      return {
        content: [{
          type: 'text',
          text: `I don't have a specific maintenance guide for "${category}". Available categories: ${available}.`,
        }],
      };
    }

    return { content: [{ type: 'text', text: formatSchedule(schedule) }] };
  },
};
```

**Step 4: Run tests to verify they pass**

Run: `cd ~/dev/home-maintenance && npx vitest run src/__tests__/guide-tools.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
cd ~/dev/home-maintenance
git add src/tools/guide-tools.ts src/__tests__/guide-tools.test.ts
git commit -m "feat: maintenance guide tool with embedded expert schedules"
```

---

## Task 6: Due Check Tool

**Files:**
- Create: `~/dev/home-maintenance/src/__tests__/schedule-tools.test.ts`
- Create: `~/dev/home-maintenance/src/tools/schedule-tools.ts`

**Step 1: Write the failing tests**

Create `~/dev/home-maintenance/src/__tests__/schedule-tools.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '@scaffold/core';
import type { ToolContext } from '@scaffold/core';
import { addApplianceTool } from '../tools/appliance-tools.js';
import { logMaintenanceTool } from '../tools/log-tools.js';
import { checkDueTool } from '../tools/schedule-tools.js';

function makeCtx(storage: InMemoryAdapter, userId = 'user1'): ToolContext {
  return {
    authKeyHash: 'test-key-hash',
    userId,
    isAdmin: false,
    storage,
    env: {},
    debugMode: false,
    requestId: 'req-1',
  };
}

function extractId(text: string): string {
  const match = text.match(/\(([a-z0-9]+)\)/);
  return match?.[1] ?? '';
}

describe('schedule check tools', () => {
  let storage: InMemoryAdapter;
  let ctx: ToolContext;

  beforeEach(() => {
    storage = new InMemoryAdapter();
    ctx = makeCtx(storage);
  });

  it('shows items as due when no maintenance has been logged', async () => {
    await addApplianceTool.handler({ name: 'Central AC', category: 'hvac' }, ctx);

    const result = await checkDueTool.handler({}, ctx);
    const text = result.content[0]!.text!;
    // Should show HVAC tasks as due since no maintenance has ever been logged
    expect(text).toContain('Central AC');
    expect(text).toContain('filter');
  });

  it('shows nothing due when maintenance was just logged', async () => {
    const createResult = await addApplianceTool.handler({ name: 'Smoke Detectors', category: 'safety' }, ctx);
    const appId = extractId(createResult.content[0]!.text!);

    // Log all safety maintenance tasks as done today
    await logMaintenanceTool.handler(
      { applianceId: appId, eventType: 'routine', description: 'Tested all detectors' },
      ctx,
    );

    const result = await checkDueTool.handler({ applianceId: appId }, ctx);
    const text = result.content[0]!.text!;
    // The most frequent safety task is monthly (30 days), so nothing should be due right now
    expect(text).not.toContain('OVERDUE');
  });

  it('shows overdue items when maintenance is old', async () => {
    const createResult = await addApplianceTool.handler({ name: 'Central AC', category: 'hvac' }, ctx);
    const appId = extractId(createResult.content[0]!.text!);

    // Log a filter change 120 days ago (overdue for 90-day interval)
    const oldDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
    await logMaintenanceTool.handler(
      { applianceId: appId, eventType: 'routine', description: 'Replaced air filter', date: oldDate },
      ctx,
    );

    const result = await checkDueTool.handler({ applianceId: appId }, ctx);
    const text = result.content[0]!.text!;
    expect(text).toContain('OVERDUE');
  });

  it('returns message when no appliances exist', async () => {
    const result = await checkDueTool.handler({}, ctx);
    expect(result.content[0]!.text).toContain('No appliance');
  });

  it('can filter by specific appliance', async () => {
    await addApplianceTool.handler({ name: 'Central AC', category: 'hvac' }, ctx);
    const createResult2 = await addApplianceTool.handler({ name: 'Washer', category: 'laundry' }, ctx);
    const washerId = extractId(createResult2.content[0]!.text!);

    const result = await checkDueTool.handler({ applianceId: washerId }, ctx);
    const text = result.content[0]!.text!;
    expect(text).toContain('Washer');
    expect(text).not.toContain('Central AC');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd ~/dev/home-maintenance && npx vitest run src/__tests__/schedule-tools.test.ts`
Expected: FAIL — module `../tools/schedule-tools.js` does not exist

**Step 3: Implement due check tool**

Create `~/dev/home-maintenance/src/tools/schedule-tools.ts`:

```typescript
import type { ScaffoldTool, ToolContext, ToolResult } from '@scaffold/core';
import type { Appliance, MaintenanceLog } from '../types.js';
import { applianceKey, appliancesPrefix, logsPrefix } from '../keys.js';
import { getSchedule } from '../schedules.js';
import type { MaintenanceTask } from '../schedules.js';

interface DueItem {
  applianceName: string;
  applianceId: string;
  taskName: string;
  intervalDays: number;
  daysSinceLast: number | null;  // null = never done
  daysOverdue: number;           // negative = days until due
  difficulty: string;
}

export const checkDueTool: ScaffoldTool = {
  name: 'home:check_due',
  description: `Check what home maintenance is due or overdue. Compares last service dates against recommended intervals.
Call with no arguments to check all appliances, or specify an applianceId to check one.
Returns items sorted by urgency: overdue first, then upcoming.`,
  inputSchema: {
    type: 'object',
    properties: {
      applianceId: { type: 'string', description: 'Check a specific appliance (optional \u2014 omit to check all)' },
    },
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { applianceId } = (input as { applianceId?: string }) || {};
    const now = Date.now();

    // Get appliances to check
    let appliances: Appliance[] = [];

    if (applianceId) {
      const appliance = await ctx.storage.get<Appliance>(applianceKey(ctx.userId, applianceId));
      if (!appliance) {
        return { content: [{ type: 'text', text: `Appliance "${applianceId}" not found.` }], isError: true };
      }
      appliances = [appliance];
    } else {
      const prefix = appliancesPrefix(ctx.userId);
      const result = await ctx.storage.list(prefix);
      const keys = result.keys.filter(k => !k.slice(prefix.length).includes('/'));

      if (keys.length === 0) {
        return { content: [{ type: 'text', text: 'No appliances tracked. Use home:add_appliance or home:quick_setup to get started.' }] };
      }

      for (const key of keys) {
        const appliance = await ctx.storage.get<Appliance>(key);
        if (appliance) appliances.push(appliance);
      }
    }

    // For each appliance, check schedule against last maintenance
    const dueItems: DueItem[] = [];

    for (const appliance of appliances) {
      const schedule = getSchedule(appliance.category);
      if (!schedule) continue;

      // Get all logs for this appliance
      const logsList = await ctx.storage.list(logsPrefix(ctx.userId, appliance.id));
      const logs: MaintenanceLog[] = [];
      for (const key of logsList.keys) {
        const log = await ctx.storage.get<MaintenanceLog>(key);
        if (log) logs.push(log);
      }

      for (const task of schedule.tasks) {
        // Find the most recent log that could match this task
        // Simple heuristic: any maintenance log counts toward the shortest interval task
        const relevantLogs = logs.filter(l =>
          l.eventType === 'routine' || l.eventType === 'professional_service' ||
          l.eventType === 'inspection' || l.eventType === 'cleaning'
        );
        const sortedLogs = relevantLogs.sort((a, b) => b.date.localeCompare(a.date));
        const lastLog = sortedLogs[0];

        let daysSinceLast: number | null = null;
        let daysOverdue: number;

        if (lastLog) {
          daysSinceLast = Math.floor((now - new Date(lastLog.date).getTime()) / (24 * 60 * 60 * 1000));
          daysOverdue = daysSinceLast - task.intervalDays;
        } else {
          // Never done — consider it overdue
          daysOverdue = task.intervalDays;
        }

        dueItems.push({
          applianceName: appliance.name,
          applianceId: appliance.id,
          taskName: task.name,
          intervalDays: task.intervalDays,
          daysSinceLast,
          daysOverdue,
          difficulty: task.difficulty,
        });
      }
    }

    // Sort: most overdue first
    dueItems.sort((a, b) => b.daysOverdue - a.daysOverdue);

    // Format output
    const overdue = dueItems.filter(d => d.daysOverdue > 0);
    const upcoming = dueItems.filter(d => d.daysOverdue <= 0 && d.daysOverdue > -30);

    let text = '';

    if (overdue.length > 0) {
      text += `**OVERDUE (${overdue.length}):**\n`;
      for (const item of overdue) {
        const lastInfo = item.daysSinceLast !== null ? `${item.daysSinceLast} days ago` : 'never done';
        text += `- ${item.applianceName}: **${item.taskName}** \u2014 ${item.daysOverdue} days overdue (last: ${lastInfo}) [${item.difficulty}]\n`;
      }
    }

    if (upcoming.length > 0) {
      if (text) text += '\n';
      text += `**Coming up in 30 days (${upcoming.length}):**\n`;
      for (const item of upcoming) {
        const daysUntil = Math.abs(item.daysOverdue);
        text += `- ${item.applianceName}: **${item.taskName}** \u2014 due in ${daysUntil} days [${item.difficulty}]\n`;
      }
    }

    if (!text) {
      text = 'All maintenance is up to date! Nothing due in the next 30 days.';
    }

    return { content: [{ type: 'text', text }] };
  },
};
```

**Step 4: Run tests to verify they pass**

Run: `cd ~/dev/home-maintenance && npx vitest run src/__tests__/schedule-tools.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
cd ~/dev/home-maintenance
git add src/tools/schedule-tools.ts src/__tests__/schedule-tools.test.ts
git commit -m "feat: due check tool — calculates overdue and upcoming maintenance"
```

---

## Task 7: Wire Up All Tools

**Files:**
- Modify: `~/dev/home-maintenance/src/tools.ts`

**Step 1: Update `src/tools.ts` to export all tools**

Replace `~/dev/home-maintenance/src/tools.ts` with:

```typescript
import type { ScaffoldTool } from '@scaffold/core';
import {
  addApplianceTool,
  getApplianceTool,
  listAppliancesTool,
  removeApplianceTool,
  quickSetupTool,
} from './tools/appliance-tools.js';
import { logMaintenanceTool } from './tools/log-tools.js';
import { maintenanceGuideTool } from './tools/guide-tools.js';
import { checkDueTool } from './tools/schedule-tools.js';

export const homeTools: ScaffoldTool[] = [
  // Appliance management
  addApplianceTool,
  getApplianceTool,
  listAppliancesTool,
  removeApplianceTool,
  quickSetupTool,

  // Maintenance logging
  logMaintenanceTool,

  // Knowledge base
  maintenanceGuideTool,

  // Schedule checking
  checkDueTool,
];
```

**Step 2: Run full test suite**

Run: `cd ~/dev/home-maintenance && npx vitest run`
Expected: All tests pass (23 tests across 4 test files)

**Step 3: Run typecheck**

Run: `cd ~/dev/home-maintenance && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
cd ~/dev/home-maintenance
git add src/tools.ts
git commit -m "feat: wire up all 8 tools in main export"
```

---

## Task 8: README

**Files:**
- Create: `~/dev/home-maintenance/README.md`

**Step 1: Write README**

Create `~/dev/home-maintenance/README.md`:

```markdown
# Home Maintenance Tracker

A home maintenance assistant built on the [Scaffold MCP framework](https://github.com/your-repo/scaffold). Tracks appliances and systems, logs maintenance events, checks what's due, and provides expert guidance on recommended maintenance schedules.

## Tools (8 total)

### Appliance Management
| Tool | Description |
|------|-------------|
| `home:add_appliance` | Add an appliance or system to track |
| `home:get_appliance` | Get full details with maintenance history |
| `home:list_appliances` | List all tracked appliances |
| `home:remove_appliance` | Remove an appliance and its logs |
| `home:quick_setup` | Batch-add common appliances by category |

### Maintenance Logging
| Tool | Description |
|------|-------------|
| `home:log_maintenance` | Log a service event (routine, repair, inspection, etc.) |

### Knowledge Base
| Tool | Description |
|------|-------------|
| `home:maintenance_guide` | Look up recommended maintenance by category |

### Schedule Checking
| Tool | Description |
|------|-------------|
| `home:check_due` | Check what maintenance is due or overdue |

## Quick Start

```bash
# Install dependencies
npm install

# Run tests
npm test

# Local dev
npm run dev
```

## Onboarding Example

> **User:** I just bought a house. Help me set up maintenance tracking.
>
> **Assistant:** *calls home:quick_setup with common categories*
>
> I've set up tracking for your HVAC, water heater, kitchen appliances, laundry, safety systems, and exterior. Let me check what's due...
>
> *calls home:check_due*

## Appliance Categories

hvac, water_heater, plumbing, electrical, kitchen_appliance, laundry, exterior, roofing, safety, garage

## Deploy

```bash
wrangler kv namespace create DATA
# Update wrangler.toml with the namespace ID
npm run deploy
```
```

**Step 2: Commit**

```bash
cd ~/dev/home-maintenance
git add README.md
git commit -m "docs: add README with tool reference and onboarding example"
```

---

## Task 9: CLAUDE.md Project Config

**Files:**
- Create: `~/dev/home-maintenance/CLAUDE.md`

**Step 1: Write CLAUDE.md**

Create `~/dev/home-maintenance/CLAUDE.md`:

```markdown
# Home Maintenance Tracker

## Project Overview
Scaffold MCP assistant for home maintenance tracking. Standalone project using `@scaffold/core` via file link.

## Development Commands
- `npm test` — Run all tests
- `npm run dev` — Local dev server
- `npm run typecheck` — TypeScript check
- `npm run deploy` — Deploy to Cloudflare

## Key Patterns
- Import from `@scaffold/core` (not subpaths)
- `InMemoryAdapter` for tests, `CloudflareKVAdapter` for production
- Tool names: `home:{action}` (e.g., `home:add_appliance`)
- Timestamps: ISO 8601 strings
- IDs: `Date.now().toString(36) + Math.random().toString(36).slice(2, 6)`

## KV Key Layout
- `{userId}/appliances/{id}` — Appliance records
- `{userId}/appliances/{id}/logs/{logId}` — Maintenance logs (nested)
- When listing appliances, filter out nested log keys

## File Structure
- `src/types.ts` — Appliance, MaintenanceLog interfaces
- `src/keys.ts` — KV key helper functions
- `src/schedules.ts` — Embedded maintenance schedule data (shared by guide + check_due tools)
- `src/tools/` — Tool implementations (one file per category)
- `src/__tests__/` — Vitest test files
```

**Step 2: Commit**

```bash
cd ~/dev/home-maintenance
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md project config"
```

---

## Summary

**Total: 8 tools across 4 categories**

| Category | Tools | Purpose |
|----------|-------|---------|
| Appliance Management | add, get, list, remove, quick_setup | Track home systems |
| Maintenance Logging | log_maintenance | Record service events with cost/provider |
| Knowledge Base | maintenance_guide | Embedded expert schedules for 10 categories |
| Schedule Checking | check_due | Calculate overdue and upcoming maintenance |

**Files created: 15**
- 5 config files (package.json, tsconfig.json, wrangler.toml, README.md, CLAUDE.md)
- 1 worker entry point (src/index.ts)
- 1 tool barrel export (src/tools.ts)
- 3 shared modules (src/types.ts, src/keys.ts, src/schedules.ts)
- 4 tool modules in src/tools/ (appliance, log, guide, schedule)
- 4 test files in src/__tests__/

**Test coverage: 23 tests** covering all tools, error cases, user isolation, onboarding flow, and due-date calculation.

**Parallelism strategy:**
- Sequential: Tasks 1-2 (scaffolding + types/keys/schedules)
- Parallel: Tasks 3, 4, 5, 6 (tool categories — independent modules)
- Sequential: Tasks 7, 8, 9 (wire-up + docs — depend on tool tasks)
