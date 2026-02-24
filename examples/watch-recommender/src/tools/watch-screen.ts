import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import type { ScreenContext } from '../types.js';
import { TmdbClient } from '../tmdb.js';

export const watchScreenTool: ScaffoldTool = {
  name: 'watch-screen',
  description:
    'Second screen companion — get detailed context about what you\'re watching. ' +
    'Use action "start" with a title to load cast, crew, trivia context. ' +
    'Use action "detail" with a personId to get a person\'s bio and filmography.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['start', 'detail'],
        description: '"start" to load context for a title, "detail" to fetch person info',
      },
      title: { type: 'string', description: 'Movie or TV show title (for start)' },
      season: { type: 'number', description: 'Season number for episode-specific context (optional, for start)' },
      episode: { type: 'number', description: 'Episode number (optional, requires season, for start)' },
      personId: { type: 'number', description: 'TMDB person ID (for detail)' },
    },
    required: ['action'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { action, title, season, episode, personId } = input as {
      action: 'start' | 'detail';
      title?: string;
      season?: number;
      episode?: number;
      personId?: number;
    };

    const tmdb = new TmdbClient(ctx.env.TMDB_API_KEY as string);

    if (action === 'start') {
      return handleStart(tmdb, title, season, episode);
    } else if (action === 'detail') {
      return handleDetail(tmdb, personId);
    }

    return { content: [{ type: 'text', text: 'Unknown action. Use "start" or "detail".' }], isError: true };
  },
};

async function handleStart(
  tmdb: TmdbClient,
  title?: string,
  season?: number,
  episode?: number,
): Promise<ToolResult> {
  if (!title) {
    return { content: [{ type: 'text', text: 'Title is required for "start" action.' }], isError: true };
  }

  const results = await tmdb.searchMulti(title);
  if (results.length === 0) {
    return { content: [{ type: 'text', text: `No results found on TMDB for "${title}".` }], isError: true };
  }

  const match = results[0];
  const tmdbId = match.id;
  const type = match.media_type as 'movie' | 'tv';
  const displayTitle = (match.title ?? match.name) as string;

  // Fetch details, credits, and keywords in parallel
  const fetches: [
    ReturnType<typeof tmdb.getDetails>,
    ReturnType<typeof tmdb.getCredits>,
    ReturnType<typeof tmdb.getKeywords>,
    ...(ReturnType<typeof tmdb.getEpisodeDetails>)[],
  ] = [
    tmdb.getDetails(tmdbId, type),
    tmdb.getCredits(tmdbId, type),
    tmdb.getKeywords(tmdbId, type),
  ];

  const includeEpisode = type === 'tv' && season != null && episode != null;
  if (includeEpisode) {
    fetches.push(tmdb.getEpisodeDetails(tmdbId, season!, episode!));
  }

  const [details, credits, keywords, episodeDetails] = await Promise.all(fetches);

  const context: ScreenContext = {
    tmdbId,
    title: displayTitle,
    type,
    overview: details.overview,
    genres: details.genres,
    releaseDate: details.releaseDate,
    runtime: details.runtime,
    seasons: details.seasons,
    episodes: details.episodes,
    status: details.status,
    tagline: details.tagline,
    languages: details.languages,
    countries: details.countries,
    cast: credits.cast,
    crew: credits.crew,
    createdBy: details.createdBy,
    keywords,
    episode: episodeDetails
      ? {
          season: episodeDetails.season,
          episode: episodeDetails.episode,
          name: episodeDetails.name,
          overview: episodeDetails.overview,
          airDate: episodeDetails.airDate,
          guestStars: episodeDetails.guestStars,
          crew: episodeDetails.crew,
        }
      : undefined,
  };

  const episodeLabel = context.episode
    ? ` S${context.episode.season}E${context.episode.episode}`
    : '';

  const hint = [
    '---',
    `SECOND SCREEN ACTIVE for "${displayTitle}"${episodeLabel}.`,
    'Shortcuts: n=next interesting fact, c=cast, w=writers/directors, t=trivia, l=locations, h=history/timeline',
    'User can also ask any freeform question.',
    'Use watch-screen detail with personId to fetch person bios/filmographies when needed.',
  ].join('\n');

  const output = JSON.stringify(context, null, 2) + '\n\n' + hint;

  return { content: [{ type: 'text', text: output }] };
}

async function handleDetail(
  tmdb: TmdbClient,
  personId?: number,
): Promise<ToolResult> {
  if (!personId) {
    return { content: [{ type: 'text', text: 'personId is required for "detail" action.' }], isError: true };
  }

  const [person, credits] = await Promise.all([
    tmdb.getPersonDetails(personId),
    tmdb.getPersonCredits(personId),
  ]);

  const output = JSON.stringify({ ...person, credits }, null, 2);
  return { content: [{ type: 'text', text: output }] };
}
