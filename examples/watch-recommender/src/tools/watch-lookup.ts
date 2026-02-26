import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { WatchProviderResult, TmdbCredits, TmdbDetails } from '../tmdb.js';
import { getTmdbClient } from '../tmdb.js';

export const watchLookupTool: ScaffoldTool = {
  name: 'watch-lookup',
  description: 'Look up a movie or TV show on TMDB. Returns metadata (genres, rating, overview, year) and streaming availability. Pass year/type to disambiguate remakes. Use include to fetch credits, details, or keywords for fact-checking.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Title to search for' },
      year: { type: 'number', description: 'Release year to disambiguate (e.g. 2019)' },
      type: { type: 'string', enum: ['movie', 'tv'], description: 'Filter to movie or tv' },
      include: {
        type: 'array',
        items: { type: 'string', enum: ['credits', 'details', 'keywords'] },
        description: 'Extra data: credits = top 5 cast + key crew, details = runtime/seasons/episodes/status/countries, keywords = thematic tags',
      },
      region: { type: 'string', description: 'Region code for streaming availability (default: US)' },
    },
    required: ['title'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { title, year: inputYear, type: inputType, include, region } = input as {
      title: string; year?: number; type?: 'movie' | 'tv'; include?: string[]; region?: string;
    };
    const tmdb = await getTmdbClient(ctx);

    let results = await tmdb.searchMulti(title);
    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No results found for "${title}".` }], isError: true };
    }

    // Filter by type if provided
    let typeFilterFallback = false;
    if (inputType) {
      const filtered = results.filter(r => r.media_type === inputType);
      if (filtered.length > 0) {
        results = filtered;
      } else {
        typeFilterFallback = true;
      }
    }

    // Sort by year proximity if year provided
    if (inputYear) {
      results.sort((a, b) => {
        const yearA = parseInt((a.release_date ?? a.first_air_date ?? '').split('-')[0]) || 0;
        const yearB = parseInt((b.release_date ?? b.first_air_date ?? '').split('-')[0]) || 0;
        return Math.abs(yearA - inputYear) - Math.abs(yearB - inputYear);
      });
    }

    const match = results[0];
    const mediaType = match.media_type as 'movie' | 'tv';
    const displayTitle = match.title ?? match.name ?? title;
    const year = (match.release_date ?? match.first_air_date ?? '').split('-')[0];
    const genres = tmdb.genreNames(match.genre_ids);

    // Build parallel fetch list: providers always, plus any include facets.
    // Unpacking order below must match push order: providers, credits, details, keywords.
    const includeSet = new Set(include ?? []);
    const fetches: Promise<unknown>[] = [
      tmdb.getWatchProviders(match.id, mediaType, region ?? 'US'),
    ];
    if (includeSet.has('credits')) fetches.push(tmdb.getCredits(match.id, mediaType));
    if (includeSet.has('details')) fetches.push(tmdb.getDetails(match.id, mediaType));
    if (includeSet.has('keywords')) fetches.push(tmdb.getKeywords(match.id, mediaType));

    const fetchResults = await Promise.all(fetches);

    let idx = 0;
    const providers = fetchResults[idx++] as WatchProviderResult;
    const credits = includeSet.has('credits') ? fetchResults[idx++] as TmdbCredits : null;
    const details = includeSet.has('details') ? fetchResults[idx++] as TmdbDetails : null;
    const keywords = includeSet.has('keywords') ? fetchResults[idx++] as string[] : null;

    // Build output
    const sections: string[] = [
      `**${displayTitle}** (${year}, ${mediaType})`,
      `Rating: ${match.vote_average}/10 | Genres: ${genres.join(', ')}`,
    ];
    if (typeFilterFallback) {
      sections.push(`(Note: no ${inputType} results found — showing best ${mediaType} match instead.)`);
    }
    if (match.overview) sections.push(match.overview);

    // Streaming availability
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

    // Credits
    if (credits) {
      if (credits.cast.length > 0) {
        const castList = credits.cast.slice(0, 5).map(c => `${c.name} as ${c.character}`).join(', ');
        sections.push(`\n**Cast:** ${castList}`);
      }
      if (credits.crew.length > 0) {
        const crewList = credits.crew.map(c => `${c.name} (${c.job})`).join(', ');
        sections.push(`**Crew:** ${crewList}`);
      }
    }

    // Details
    if (details) {
      const parts: string[] = [];
      if (details.runtime) parts.push(`${details.runtime} min`);
      if (details.seasons != null) parts.push(`${details.seasons} seasons`);
      if (details.episodes != null) parts.push(`${details.episodes} episodes`);
      if (details.status) parts.push(details.status);
      if (parts.length > 0) sections.push(`\n**Details:** ${parts.join(' | ')}`);
      if (details.countries.length > 0) sections.push(`**Countries:** ${details.countries.join(', ')}`);
      if (details.languages.length > 0) sections.push(`**Languages:** ${details.languages.join(', ')}`);
      if (details.createdBy?.length) sections.push(`**Created by:** ${details.createdBy.join(', ')}`);
    }

    // Keywords
    if (keywords && keywords.length > 0) {
      sections.push(`\n**Keywords:** ${keywords.slice(0, 10).join(', ')}`);
    }

    return {
      content: [{ type: 'text', text: sections.join('\n') }],
    };
  },
};
