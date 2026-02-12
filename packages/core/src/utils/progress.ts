import type { StorageAdapter, ToolContext, ProgressEntry, QualityCheck } from '../types/public-api.js';

const PROGRESS_TTL = 90 * 86400; // 90 days

export interface TrendInfo {
  direction: 'improving' | 'declining' | 'stable';
  recentValue: number;
  priorValue: number;
}

export interface ProgressResult {
  entries: ProgressEntry[];
  totalEntries: number;
  trends: Record<string, TrendInfo>;
}

/**
 * Log a progress entry for a tool call.
 */
export async function logProgress(
  ctx: ToolContext,
  toolName: string,
  data: Omit<ProgressEntry, 'toolName' | 'timestamp'>
): Promise<void> {
  const timestamp = new Date().toISOString();
  const key = `${ctx.userId}/_progress/${toolName}/${timestamp}`;
  const entry: ProgressEntry = { toolName, timestamp, ...data };
  await ctx.storage.put(key, entry, { ttl: PROGRESS_TTL });
}

/**
 * Get progress entries and computed trends for a tool.
 */
export async function getProgress(
  storage: StorageAdapter,
  userId: string,
  toolName: string,
  limit: number
): Promise<ProgressResult> {
  const prefix = `${userId}/_progress/${toolName}/`;
  const listResult = await storage.list(prefix, { limit: 1000 });
  const totalEntries = listResult.keys.length;

  if (totalEntries === 0) {
    return { entries: [], totalEntries: 0, trends: {} };
  }

  // Load all entries for trend calculation, sort newest first
  const allEntries: ProgressEntry[] = [];
  for (const key of listResult.keys) {
    const entry = await storage.get<ProgressEntry>(key);
    if (entry) allEntries.push(entry);
  }
  allEntries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Compute trends using all entries (split-half)
  const trends = computeTrends(allEntries);

  // Return only the requested limit
  const entries = allEntries.slice(0, limit);

  return { entries, totalEntries, trends };
}

/**
 * Split entries into recent vs prior halves, compute direction for each metric.
 */
function computeTrends(entries: ProgressEntry[]): Record<string, TrendInfo> {
  if (entries.length < 2) return {};

  const mid = Math.floor(entries.length / 2);
  // entries are newest-first, so recent = first half, prior = second half
  const recent = entries.slice(0, mid);
  const prior = entries.slice(mid);
  const trends: Record<string, TrendInfo> = {};

  // Trend for checks (pass rate)
  const checkNames = new Set<string>();
  for (const e of entries) {
    for (const c of e.checks ?? []) checkNames.add(c.name);
  }

  for (const name of checkNames) {
    const recentRate = passRate(recent, name);
    const priorRate = passRate(prior, name);
    trends[name] = { direction: direction(recentRate, priorRate), recentValue: recentRate, priorValue: priorRate };
  }

  // Trend for scores (average)
  const scoreNames = new Set<string>();
  for (const e of entries) {
    for (const key of Object.keys(e.scores ?? {})) scoreNames.add(key);
  }

  for (const name of scoreNames) {
    const recentAvg = avgScore(recent, name);
    const priorAvg = avgScore(prior, name);
    trends[name] = { direction: direction(recentAvg, priorAvg), recentValue: recentAvg, priorValue: priorAvg };
  }

  return trends;
}

function passRate(entries: ProgressEntry[], checkName: string): number {
  let total = 0;
  let passed = 0;
  for (const e of entries) {
    const check = (e.checks ?? []).find(c => c.name === checkName);
    if (check) {
      total++;
      if (check.passed) passed++;
    }
  }
  return total === 0 ? 0 : passed / total;
}

function avgScore(entries: ProgressEntry[], scoreName: string): number {
  let total = 0;
  let sum = 0;
  for (const e of entries) {
    const val = e.scores?.[scoreName];
    if (val != null) {
      total++;
      sum += val;
    }
  }
  return total === 0 ? 0 : sum / total;
}

function direction(recent: number, prior: number): 'improving' | 'declining' | 'stable' {
  const diff = recent - prior;
  if (diff > 0.1) return 'improving';
  if (diff < -0.1) return 'declining';
  return 'stable';
}

export const progress = { logProgress, getProgress };
