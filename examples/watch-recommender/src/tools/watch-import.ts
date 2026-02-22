import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { WatchRecord } from '../types.js';
import { TmdbClient } from '../tmdb.js';
import { watchedKey } from '../keys.js';

function parseNetflixCsv(csv: string): { title: string; date: string }[] {
  const lines = csv.split('\n').map(l => l.trim()).filter(Boolean);
  // Skip header
  const dataLines = lines.slice(1);

  return dataLines.map(line => {
    // Handle quoted fields: "Title with, comma",date
    let title: string;
    let date: string;
    if (line.startsWith('"')) {
      const closingQuote = line.indexOf('"', 1);
      title = line.substring(1, closingQuote);
      date = line.substring(closingQuote + 2); // skip ",
    } else {
      const parts = line.split(',');
      title = parts[0];
      date = parts[1] ?? '';
    }
    return { title: title.trim(), date: date.trim() };
  });
}

function extractShowName(title: string): string {
  // Netflix format: "Show Name: Season X: Episode Title"
  // Extract just the show name (before first colon)
  const colonIndex = title.indexOf(':');
  if (colonIndex > 0) {
    return title.substring(0, colonIndex).trim();
  }
  return title;
}

export const watchImportTool: ScaffoldTool = {
  name: 'watch-import',
  description: 'INTERNAL ONLY — called by the browser admin page, never from conversation. You cannot accept or process CSV data in chat. To import watch history, use watch-history-upload (action "prepare") which gives the user a browser upload URL.',
  inputSchema: {
    type: 'object',
    properties: {
      csv: { type: 'string', description: 'CSV content (Netflix format: Title,Date)' },
      source: { type: 'string', description: 'Source platform (default: "netflix")' },
    },
    required: ['csv'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { csv, source } = input as { csv: string; source?: string };
    const tmdb = new TmdbClient(ctx.env.TMDB_API_KEY as string);

    const entries = parseNetflixCsv(csv);

    // Deduplicate: extract show names for TV, keep movie titles as-is
    const uniqueTitles = new Map<string, string>(); // normalized -> latest date
    for (const entry of entries) {
      const name = extractShowName(entry.title);
      if (!uniqueTitles.has(name) || entry.date > (uniqueTitles.get(name) ?? '')) {
        uniqueTitles.set(name, entry.date);
      }
    }

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const failedTitles: string[] = [];

    for (const [title, date] of uniqueTitles) {
      try {
        const results = await tmdb.searchMulti(title);
        if (results.length === 0) {
          failed++;
          failedTitles.push(title);
          continue;
        }

        const match = results[0];
        const key = watchedKey(ctx.userId, match.id);

        // Skip if already in watch history
        const existing = await ctx.storage.get(key);
        if (existing) {
          skipped++;
          continue;
        }

        const record: WatchRecord = {
          tmdbId: match.id,
          title: match.title ?? match.name ?? title,
          type: match.media_type as 'movie' | 'tv',
          watchedDate: date || undefined,
          source: source ?? 'netflix',
          genres: tmdb.genreNames(match.genre_ids),
          overview: match.overview,
          posterPath: match.poster_path ?? undefined,
        };

        await ctx.storage.put(key, record);
        imported++;
      } catch {
        failed++;
        failedTitles.push(title);
      }
    }

    const parts = [`**${imported} titles imported**`];
    if (skipped > 0) parts.push(`${skipped} skipped (already in history)`);
    if (failed > 0) parts.push(`${failed} failed: ${failedTitles.join(', ')}`);

    return { content: [{ type: 'text', text: parts.join(', ') }] };
  },
};
