import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import { storage } from '@voygent/scaffold-core';
import type { OnboardingState, TasteProfile, Preferences } from '../types.js';
import { onboardingKey, tasteProfileKey, preferencesKey, watchedPrefix, dismissedPrefix } from '../keys.js';

interface CuratedTitle {
  title: string;
  year: number;
  type: 'movie' | 'tv';
  genres: string[];
  signal: string; // what a thumbs-up reveals — for Claude's use, never shown to user
}

const CURATED_TITLES: CuratedTitle[] = [
  // Movies
  { title: 'Parasite', year: 2019, type: 'movie', genres: ['Thriller', 'Drama'], signal: 'Enjoys subtitled/international cinema, class commentary, tonal shifts' },
  { title: 'Spider-Man: Into the Spider-Verse', year: 2018, type: 'movie', genres: ['Animation', 'Action'], signal: 'Open to animated films for adults, visual style matters' },
  { title: 'The Grand Budapest Hotel', year: 2014, type: 'movie', genres: ['Comedy', 'Drama'], signal: 'Appreciates auteur style, whimsy, visual storytelling' },
  { title: 'Mad Max: Fury Road', year: 2015, type: 'movie', genres: ['Action', 'Sci-Fi'], signal: 'Loves high-octane action, practical effects, worldbuilding' },
  { title: 'Hereditary', year: 2018, type: 'movie', genres: ['Horror', 'Drama'], signal: 'Tolerates or enjoys elevated horror, slow-burn dread' },
  { title: 'When Harry Met Sally', year: 1989, type: 'movie', genres: ['Romance', 'Comedy'], signal: 'Enjoys classic rom-coms, dialogue-driven films' },
  { title: 'Free Solo', year: 2018, type: 'movie', genres: ['Documentary'], signal: 'Watches documentaries for entertainment, drawn to human endurance stories' },
  { title: 'Everything Everywhere All at Once', year: 2022, type: 'movie', genres: ['Sci-Fi', 'Comedy', 'Drama'], signal: 'Enjoys genre-bending, emotional maximalism, absurdist humor' },
  { title: 'The Shawshank Redemption', year: 1994, type: 'movie', genres: ['Drama'], signal: 'Classic taste, values hope and character-driven narrative' },
  { title: 'Arrival', year: 2016, type: 'movie', genres: ['Sci-Fi', 'Drama'], signal: 'Enjoys cerebral sci-fi, non-linear storytelling, emotional payoff' },
  // TV Shows
  { title: 'Breaking Bad', year: 2008, type: 'tv', genres: ['Crime', 'Drama'], signal: 'Enjoys serialized drama, antiheroes, moral complexity' },
  { title: 'Fleabag', year: 2016, type: 'tv', genres: ['Comedy', 'Drama'], signal: 'Appreciates fourth-wall breaks, dark humor, emotional honesty' },
  { title: 'Planet Earth II', year: 2016, type: 'tv', genres: ['Documentary'], signal: 'Enjoys nature documentaries, visual spectacle, relaxing viewing' },
  { title: 'Stranger Things', year: 2016, type: 'tv', genres: ['Sci-Fi', 'Horror'], signal: 'Likes nostalgia-driven genre shows, ensemble casts, adventure' },
  { title: 'The Office (US)', year: 2005, type: 'tv', genres: ['Comedy'], signal: 'Enjoys cringe comedy, workplace humor, rewatchable comfort shows' },
  { title: 'Succession', year: 2018, type: 'tv', genres: ['Drama'], signal: 'Drawn to sharp writing, family dynamics, prestige TV' },
  { title: 'The Bear', year: 2022, type: 'tv', genres: ['Drama', 'Comedy'], signal: 'Appreciates intense character studies, food culture, kinetic storytelling' },
  { title: 'Love Is Blind', year: 2020, type: 'tv', genres: ['Reality'], signal: 'Enjoys reality TV, social experiments, guilty pleasures' },
  { title: 'Band of Brothers', year: 2001, type: 'tv', genres: ['War', 'Drama', 'History'], signal: 'Drawn to war/history epics, brotherhood themes, prestige miniseries' },
  { title: 'Severance', year: 2022, type: 'tv', genres: ['Sci-Fi', 'Thriller'], signal: 'Enjoys slow-burn mystery, dystopian concepts, workplace satire' },
];

export const watchOnboardTool: ScaffoldTool = {
  name: 'watch-onboard',
  description: 'Interactive onboarding and taste discovery. Actions: "check" to see what\'s needed and get an interview script with curated titles, "complete" to mark onboarding done, "reset" to wipe all user data. Use mode "refine" to re-run taste discovery for existing users.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: '"check", "complete", or "reset"' },
      mode: { type: 'string', description: '"onboard" (default) or "refine" — refine always runs titles phase, skips services if set' },
      completedPhases: { type: 'array', items: { type: 'string' }, description: 'Phases completed (for complete action)' },
    },
    required: ['action'],
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { action, mode: rawMode, completedPhases } = input as {
      action: string; mode?: string; completedPhases?: string[];
    };
    const mode = rawMode ?? 'onboard';

    switch (action) {
      case 'check': {
        // Load current state
        const onboarding = await ctx.storage.get<OnboardingState>(onboardingKey(ctx.userId));
        const prefs = await ctx.storage.get<Preferences>(preferencesKey(ctx.userId));
        const profile = await ctx.storage.get<TasteProfile>(tasteProfileKey(ctx.userId));
        const watchedResult = await ctx.storage.list(watchedPrefix(ctx.userId));
        const watchedCount = watchedResult.keys.length;

        // Determine which phases are needed
        const hasServices = prefs && prefs.streamingServices.length > 0;
        const hasHistory = watchedCount > 0;
        const hasPreferences = prefs && prefs.statements.length > 0;
        const hasProfile = !!profile;

        const missingPhases: string[] = [];

        if (mode === 'refine') {
          if (!hasServices) missingPhases.push('services');
          missingPhases.push('titles'); // always run in refine mode
        } else {
          if (!hasServices) missingPhases.push('services');
          if (!hasHistory) missingPhases.push('history');
          if (!hasHistory) missingPhases.push('titles');
          if (!hasPreferences) missingPhases.push('preferences');
        }

        // Build response
        const sections: string[] = [];

        // Status block
        sections.push('## Onboarding Status\n');
        sections.push(`| Area | Status |`);
        sections.push(`|------|--------|`);
        sections.push(`| Streaming services | ${hasServices ? `Set (${prefs!.streamingServices.join(', ')})` : 'Not set'} |`);
        sections.push(`| Watch history | ${watchedCount > 0 ? `${watchedCount} titles` : 'Empty'} |`);
        sections.push(`| Preferences | ${hasPreferences ? `${prefs!.statements.length} statements` : 'None'} |`);
        sections.push(`| Taste profile | ${hasProfile ? 'Generated' : 'Not generated'} |`);
        sections.push(`| Onboarding | ${onboarding?.completedAt ? `Completed ${onboarding.completedAt}` : 'Not completed'} |`);
        sections.push('');

        const adminUrl = `${ctx.env.PUBLIC_URL}/app?token=${ctx.env.ADMIN_KEY}`;
        sections.push('## Admin Page');
        sections.push(`The user has a web dashboard for uploading CSV files, managing preferences, and viewing history: ${adminUrl}`);
        sections.push('Share this link early so they can bookmark it.');
        sections.push('');

        if (missingPhases.length === 0) {
          sections.push('**All set!** This user has completed all onboarding phases.');
          if (mode !== 'refine') {
            sections.push('Use mode "refine" if they want to update their taste profile with fresh reactions.');
          }
          return { content: [{ type: 'text', text: sections.join('\n') }] };
        }

        sections.push(`**Mode:** ${mode}`);
        sections.push(`**Phases to run:** ${missingPhases.join(', ')}\n`);

        // Interview script
        sections.push('---');
        sections.push('## Tone Rules (follow strictly)\n');
        sections.push('- No emojis anywhere in your responses.');
        sections.push('- Be direct and concise. No filler, no praise, no editorializing.');
        sections.push('- Don\'t compliment the user\'s answers ("Great choice!", "Excellent!", "That\'s very high-signal").');
        sections.push('- Present information cleanly — let the titles and data speak for themselves.');
        sections.push('- When summarizing findings, be factual and specific, not flattering.');
        sections.push('');
        sections.push('---');
        sections.push('## Interview Script\n');
        sections.push('Follow these phases in order. Skip any phase not in the "Phases to run" list above.\n');

        if (missingPhases.includes('services')) {
          sections.push('### Phase 1: Streaming Services\n');
          sections.push('Ask: "What streaming services do you have? (Netflix, Hulu, Disney+, HBO Max, Apple TV+, Amazon Prime, Peacock, Paramount+, etc.)"');
          sections.push('');
          sections.push('After they answer, call: `watch-preference` with action `set-services` and their list.');
          sections.push('');
        }

        if (missingPhases.includes('history')) {
          sections.push('### Phase: Watch History Import\n');
          sections.push('IMPORTANT: You cannot accept CSV files or CSV text in this conversation. The only import path is the browser upload page.\n');
          sections.push('Ask: "Would you like to import your Netflix watch history? It takes about a minute and gives me a much better picture of your taste."\n');
          sections.push('If they say yes:');
          sections.push('1. Call `watch-history-upload` with action `prepare` to get the browser upload URL');
          sections.push('2. Share the URL with the user — they open it in their browser and upload the CSV file there');
          sections.push('3. Wait for them to say they are done');
          sections.push('4. Call `watch-history-upload` with action `status` to confirm the import and see how many titles were added');
          sections.push('5. Acknowledge the results and continue to the next phase');
          sections.push('');
          sections.push('If the user tries to paste or upload CSV in chat, redirect them: "I can\'t process CSV files directly — please use the upload page I linked above."');
          sections.push('');
          sections.push('If they decline, skip this phase and continue with rapid-fire titles.');
          sections.push('');
        }

        if (missingPhases.includes('titles')) {
          sections.push('### Phase 2: Taste Discovery (Rapid-Fire Titles)\n');
          sections.push('Present titles in batches of 5. Ask the user to rate each 1-5 or skip.');
          sections.push('');
          sections.push('Format each batch as a numbered list: title, year, one-word genre.');
          sections.push('Tell the user to reply with just their ratings in order, comma-separated.');
          sections.push('');
          sections.push('Example prompt to user:');
          sections.push('> "Rate each 1-5 (5=loved, 1=hated, s=skip):');
          sections.push('> 1. Parasite (2019) — thriller');
          sections.push('> 2. Spider-Verse (2018) — animated');
          sections.push('> 3. Grand Budapest Hotel (2014) — comedy');
          sections.push('> 4. Mad Max: Fury Road (2015) — action');
          sections.push('> 5. Hereditary (2018) — horror');
          sections.push('>');
          sections.push('> Reply like: 5, 3, s, 4, s"');
          sections.push('');
          sections.push('**For each rated title:** call `watch-log` with title and the given rating.');
          sections.push('**For skips:** do nothing.');
          sections.push('');
          sections.push('After all batches, synthesize 2-4 preference statements from the pattern of ratings. Call `watch-preference` with action `add` for each statement.');
          sections.push('');
          sections.push('**Curated Titles:**\n');

          // Batch 1
          sections.push('**Batch 1:**');
          for (let i = 0; i < 5; i++) {
            const t = CURATED_TITLES[i];
            sections.push(`${i + 1}. **${t.title}** (${t.year}) — ${t.type}, ${t.genres.join('/')} — _Signal: ${t.signal}_`);
          }
          sections.push('');

          // Batch 2
          sections.push('**Batch 2:**');
          for (let i = 5; i < 10; i++) {
            const t = CURATED_TITLES[i];
            sections.push(`${i - 4}. **${t.title}** (${t.year}) — ${t.type}, ${t.genres.join('/')} — _Signal: ${t.signal}_`);
          }
          sections.push('');

          // Batch 3
          sections.push('**Batch 3:**');
          for (let i = 10; i < 15; i++) {
            const t = CURATED_TITLES[i];
            sections.push(`${i - 9}. **${t.title}** (${t.year}) — ${t.type}, ${t.genres.join('/')} — _Signal: ${t.signal}_`);
          }
          sections.push('');

          // Batch 4
          sections.push('**Batch 4:**');
          for (let i = 15; i < 20; i++) {
            const t = CURATED_TITLES[i];
            sections.push(`${i - 14}. **${t.title}** (${t.year}) — ${t.type}, ${t.genres.join('/')} — _Signal: ${t.signal}_`);
          }
          sections.push('');
        }

        if (missingPhases.includes('preferences')) {
          sections.push('### Phase 3: Follow-Up Questions\n');
          sections.push('Ask 2-3 follow-up questions to capture dealbreakers and format preferences:');
          sections.push('1. "Are there any genres or themes you actively avoid?" (e.g. horror, heavy violence, subtitles)');
          sections.push('2. "Do you prefer movies, TV shows, or both equally?"');
          sections.push('3. "Any other viewing preferences I should know?" (e.g. only watch in English, prefer short series)');
          sections.push('');
          sections.push('For each meaningful answer, call `watch-preference` with action `add` and a clear preference statement.');
          sections.push('');
        }

        sections.push('### Wrap-Up\n');
        sections.push('1. Call `watch-onboard` with action `complete` and the list of `completedPhases`');
        sections.push('2. Call `watch-profile` with action `generate` to create the taste profile');
        sections.push('3. Call `watch-profile` with action `save` to persist it');
        sections.push('4. Summarize what you learned and offer to give a recommendation right away');

        return { content: [{ type: 'text', text: sections.join('\n') }] };
      }

      case 'complete': {
        const existing = await ctx.storage.get<OnboardingState>(onboardingKey(ctx.userId));
        const now = new Date().toISOString();

        const state: OnboardingState = {
          completedAt: existing?.completedAt ?? now,
          completedPhases: completedPhases ?? ['services', 'titles', 'preferences'],
          lastRunAt: now,
        };

        await ctx.storage.put(onboardingKey(ctx.userId), state);
        return { content: [{ type: 'text', text: `Onboarding marked complete. Phases: ${state.completedPhases.join(', ')}` }] };
      }

      case 'reset': {
        const watchedDeleted = await storage.deleteByPrefix(ctx.storage, watchedPrefix(ctx.userId));
        const dismissedDeleted = await storage.deleteByPrefix(ctx.storage, dismissedPrefix(ctx.userId));
        await ctx.storage.delete(preferencesKey(ctx.userId));
        await ctx.storage.delete(tasteProfileKey(ctx.userId));
        await ctx.storage.delete(onboardingKey(ctx.userId));

        return {
          content: [{
            type: 'text',
            text: `Reset complete. Deleted ${watchedDeleted} watched, ${dismissedDeleted} dismissed, plus preferences, taste profile, and onboarding state.`,
          }],
        };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown action: "${action}". Use "check", "complete", or "reset".` }], isError: true };
    }
  },
};
