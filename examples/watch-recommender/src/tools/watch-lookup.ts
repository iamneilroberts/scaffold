import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import { TmdbClient } from '../tmdb.js';

export const watchLookupTool: ScaffoldTool = {
  name: 'watch-lookup',
  description: 'Look up a movie or TV show on TMDB. Returns metadata (genres, rating, overview) and streaming availability. Use after generating recommendations to show where each title is available.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Title to search for' },
      region: { type: 'string', description: 'Region code for streaming availability (default: US)' },
    },
    required: ['title'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { title, region } = input as { title: string; region?: string };
    const tmdb = new TmdbClient(ctx.env.TMDB_API_KEY as string);

    const results = await tmdb.searchMulti(title);
    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No results found for "${title}".` }], isError: true };
    }

    const match = results[0];
    const displayTitle = match.title ?? match.name ?? title;
    const year = (match.release_date ?? match.first_air_date ?? '').split('-')[0];
    const genres = tmdb.genreNames(match.genre_ids);

    // Get streaming availability
    const providers = await tmdb.getWatchProviders(match.id, match.media_type as 'movie' | 'tv', region ?? 'US');

    const sections: string[] = [
      `**${displayTitle}** (${year}, ${match.media_type})`,
      `Rating: ${match.vote_average}/10 | Genres: ${genres.join(', ')}`,
      match.overview,
    ];

    if (providers.flatrate?.length) {
      sections.push(`\n**Stream on:** ${providers.flatrate.map(p => p.provider_name).join(', ')}`);
    }
    if (providers.rent?.length) {
      sections.push(`**Rent on:** ${providers.rent.map(p => p.provider_name).join(', ')}`);
    }
    if (providers.buy?.length) {
      sections.push(`**Buy on:** ${providers.buy.map(p => p.provider_name).join(', ')}`);
    }
    if (!providers.flatrate?.length && !providers.rent?.length && !providers.buy?.length) {
      sections.push('\nNo streaming info available for this region.');
    }

    return {
      content: [{ type: 'text', text: sections.join('\n') }],
    };
  },
};
