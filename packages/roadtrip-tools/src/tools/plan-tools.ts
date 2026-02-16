import type { ScaffoldTool, ToolContext, ToolResult, QualityGateResult } from '@voygent/scaffold-core';
import type { DayPlan, Spot } from '../types.js';
import { generateId, planKey, plansPrefix, spotKey } from '../keys.js';

interface CreatePlanInput {
  city: string;
  region: string;
  title: string;
  spotIds: string[];
  theme?: string;
  notes?: string;
  estimatedHours?: number;
  season?: 'year-round' | 'summer-only' | 'winter-only';
}

interface UpdatePlanInput {
  planId: string;
  city?: string;
  region?: string;
  title?: string;
  theme?: string;
  spotIds?: string[];
  notes?: string;
  estimatedHours?: number;
  season?: 'year-round' | 'summer-only' | 'winter-only';
}

interface ListPlansInput {
  city?: string;
  region?: string;
  season?: 'year-round' | 'summer-only' | 'winter-only';
}

async function loadAllPlans(ctx: ToolContext): Promise<DayPlan[]> {
  const { keys } = await ctx.storage.list(plansPrefix(ctx.userId));
  const plans: DayPlan[] = [];
  for (const key of keys) {
    const plan = await ctx.storage.get<DayPlan>(key);
    if (plan) plans.push(plan);
  }
  return plans;
}

export function createPlanTools(prefix: string): ScaffoldTool[] {
  // ── create_plan ─────────────────────────────────────────────
  const createPlan: ScaffoldTool = {
    name: `${prefix}-create_plan`,
    description: 'Create a new day plan linking curated spots into a themed itinerary.',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City for the day plan' },
        region: { type: 'string', description: 'Geographic region' },
        title: { type: 'string', description: 'Plan title, e.g. "Golden Circle Day Trip"' },
        spotIds: { type: 'array', items: { type: 'string' }, description: 'Spot IDs to include (3-8 recommended)' },
        theme: { type: 'string', description: 'Optional theme: "foodie crawl", "nature day", etc.' },
        notes: { type: 'string', description: 'Additional notes or tips for the day' },
        estimatedHours: { type: 'number', description: 'Estimated total hours for the day plan' },
        season: { type: 'string', enum: ['year-round', 'summer-only', 'winter-only'], description: 'Seasonal availability' },
      },
      required: ['city', 'region', 'title', 'spotIds'],
    },

    async handler(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const data = input as CreatePlanInput;
      const id = generateId();
      const now = new Date().toISOString();

      const plan: DayPlan = {
        id,
        city: data.city,
        region: data.region,
        title: data.title,
        spotIds: data.spotIds,
        theme: data.theme,
        notes: data.notes,
        estimatedHours: data.estimatedHours,
        season: data.season,
        createdAt: now,
        updatedAt: now,
      };

      await ctx.storage.put(planKey(ctx.userId, id), plan);

      return {
        content: [{
          type: 'text',
          text: `Created plan "${plan.title}" in ${plan.city}, ${plan.region} (${plan.spotIds.length} spots) — ID: ${id}`,
        }],
      };
    },

    async validate(input: unknown, _result: ToolResult, _ctx: ToolContext): Promise<QualityGateResult> {
      const data = input as CreatePlanInput;
      const checks = [];

      checks.push({
        name: 'too_few_spots',
        passed: data.spotIds.length >= 3,
        message: data.spotIds.length < 3
          ? `Plan has only ${data.spotIds.length} spot(s). Consider adding at least 3 for a full day.`
          : undefined,
        severity: 'warning' as const,
      });

      checks.push({
        name: 'too_many_spots',
        passed: data.spotIds.length <= 8,
        message: data.spotIds.length > 8
          ? `Plan has ${data.spotIds.length} spots. More than 8 may be too ambitious for a single day.`
          : undefined,
        severity: 'warning' as const,
      });

      return {
        passed: true,
        checks,
      };
    },
  };

  // ── get_plan ──────────────────────────────────────────────
  const getPlan: ScaffoldTool = {
    name: `${prefix}-get_plan`,
    description: 'Get a day plan by ID with full spot details inlined.',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'The plan ID' },
      },
      required: ['planId'],
    },

    async handler(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { planId } = input as { planId: string };
      const plan = await ctx.storage.get<DayPlan>(planKey(ctx.userId, planId));

      if (!plan) {
        return { content: [{ type: 'text', text: `Plan not found: ${planId}` }], isError: true };
      }

      // Inline full spot details
      const spots: (Spot | null)[] = [];
      for (const sid of plan.spotIds) {
        const spot = await ctx.storage.get<Spot>(spotKey(ctx.userId, sid));
        spots.push(spot ?? null);
      }

      const response = {
        ...plan,
        spots,
      };

      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    },
  };

  // ── list_plans ────────────────────────────────────────────
  const listPlans: ScaffoldTool = {
    name: `${prefix}-list_plans`,
    description: 'List day plans with optional filters by city, region, or season.',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'Filter by city' },
        region: { type: 'string', description: 'Filter by region' },
        season: { type: 'string', enum: ['year-round', 'summer-only', 'winter-only'], description: 'Filter by season' },
      },
    },

    async handler(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const filters = input as ListPlansInput;
      let plans = await loadAllPlans(ctx);

      if (filters.city) {
        const c = filters.city.toLowerCase();
        plans = plans.filter((p) => p.city.toLowerCase() === c);
      }
      if (filters.region) {
        const r = filters.region.toLowerCase();
        plans = plans.filter((p) => p.region.toLowerCase() === r);
      }
      if (filters.season) {
        const s = filters.season.toLowerCase();
        plans = plans.filter((p) => p.season?.toLowerCase() === s);
      }

      if (plans.length === 0) {
        return { content: [{ type: 'text', text: 'No day plans found.' }] };
      }

      const lines = plans.map(
        (p) => `${p.title} — ${p.city}, ${p.region} (${p.spotIds.length} spots)`,
      );

      return {
        content: [{ type: 'text', text: `${plans.length} plan(s):\n${lines.join('\n')}` }],
      };
    },
  };

  // ── update_plan ───────────────────────────────────────────
  const updatePlan: ScaffoldTool = {
    name: `${prefix}-update_plan`,
    description: 'Update fields on an existing day plan.',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'The plan ID to update' },
        city: { type: 'string' },
        region: { type: 'string' },
        title: { type: 'string' },
        theme: { type: 'string' },
        spotIds: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
        estimatedHours: { type: 'number' },
        season: { type: 'string', enum: ['year-round', 'summer-only', 'winter-only'] },
      },
      required: ['planId'],
    },

    async handler(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { planId, ...updates } = input as UpdatePlanInput;
      const existing = await ctx.storage.get<DayPlan>(planKey(ctx.userId, planId));

      if (!existing) {
        return { content: [{ type: 'text', text: `Plan not found: ${planId}` }], isError: true };
      }

      const updated: DayPlan = {
        ...existing,
        ...Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined)),
        updatedAt: new Date().toISOString(),
      };

      await ctx.storage.put(planKey(ctx.userId, planId), updated);

      return {
        content: [{ type: 'text', text: `Updated plan "${updated.title}" (${planId}).` }],
      };
    },
  };

  return [createPlan, getPlan, listPlans, updatePlan];
}
