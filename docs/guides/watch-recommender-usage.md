# Watch Recommender Usage Guide

Detailed walkthrough of all watch-recommender workflows, with examples.

## Getting Your Watch History

### Netflix Export

1. Go to [Netflix Account](https://www.netflix.com/account)
2. Click your profile
3. Scroll to **Viewing Activity**
4. Click **Download all** at the bottom of the page

This downloads a CSV file with two columns:

```csv
Title,Date
"Breaking Bad: Season 1: Pilot",01/15/2026
"Inception",01/20/2026
```

- **Title** — for TV shows, Netflix includes the episode name after colons (e.g. `Show: Season X: Episode Name`)
- **Date** — format is `MM/DD/YYYY`

During import, TV episodes are automatically deduplicated by show name (everything before the first `:`), keeping only the latest date. So 50 episodes of Breaking Bad become one entry.

> **Note:** Currently only Netflix CSV format is supported.

## Importing via Admin Page

1. Navigate to `https://your-worker.workers.dev/app?token=YOUR_TOKEN`
2. Click the **Import** tab
3. Click **Choose File** and select your Netflix CSV
4. Click **Import**

The import process:
- Parses the CSV and deduplicates TV episodes by show name
- Resolves each unique title against TMDB (The Movie Database)
- Skips titles already in your history
- Stores new entries with genre, overview, and poster metadata

The status message shows: `X titles imported, Y skipped (already in history), Z failed` — failed titles are ones TMDB couldn't match (usually obscure regional content).

Your token is saved to `localStorage` after first use, so you won't need to include it in the URL again on the same browser.

## Importing via Claude Chat

You can also paste CSV content directly into a Claude conversation:

> **You:** Import this Netflix history:
> ```
> Title,Date
> "The Bear: Season 1: System",06/23/2023
> "The Bear: Season 1: Hands",06/23/2023
> "Beef: Season 1: The Birds Don't Sing",04/06/2023
> "Inception",03/15/2023
> ```

Claude calls the `watch-import` tool with your CSV content and reports back what was imported.

## Logging Individual Titles

When you watch something new, just tell Claude:

> **You:** I just watched Severance season 2, it was amazing — 5/5

Claude calls `watch-log` with the title and your rating. The title is resolved via TMDB and added to your history.

Ratings are optional and use a 1-5 scale. They influence your taste profile — highly-rated titles (4-5) carry more weight, and low-rated titles (1-2) help identify what you don't enjoy.

## Dismissing Titles

If Claude recommends something you've already seen or aren't interested in:

> **You:** I've already seen The Office, and I'm not interested in Love Island

Claude calls `watch-dismiss` for each title:
- **"seen"** — you've watched it but didn't log it (won't be recommended again)
- **"not-interested"** — you don't want to watch it (won't be recommended, and factors into taste profiling)

## Setting Preferences

### Via Claude Chat

Just describe your taste naturally:

> **You:** I love slow-burn psychological thrillers and dark comedies. I hate reality TV and slasher horror. I prefer limited series over long-running shows.

Claude calls `watch-preference` with `action: "add"` for each statement.

**Preference statements that work well:**
- Genre preferences: "I love sci-fi that focuses on ideas over action"
- Anti-preferences: "I can't stand laugh-track sitcoms"
- Format preferences: "I prefer movies under 2 hours"
- Mood patterns: "I usually watch light comedies on weeknights"
- Quality signals: "I trust A24 films"

### Via Admin Page

1. Navigate to the admin page (`/app?token=YOUR_TOKEN`)
2. Click the **Preferences** tab
3. **Statements** — type a preference and click Add, or remove existing ones by index
4. **Streaming Services** — check the boxes for services you subscribe to:
   Netflix, Amazon Prime Video, Hulu, Disney+, HBO Max, Apple TV+, Peacock, Paramount+, Crunchyroll, YouTube Premium

### Setting Streaming Services via Chat

> **You:** I subscribe to Netflix, HBO Max, and Apple TV+

Claude calls `watch-preference` with `action: "set-services"` and your list. Recommendations will prioritize titles available on these services.

## Generating Your Taste Profile

Ask Claude to analyze your watch history:

> **You:** Generate my taste profile

Claude calls `watch-profile` with `action: "generate"`, which returns:
- Genre frequency breakdown (your top 10 genres by count)
- Highly-rated titles (4-5 stars) and what they have in common
- Low-rated titles (1-2 stars) and patterns there
- Titles you dismissed as "not interested"

Claude then synthesizes this into a natural language taste summary and calls `watch-profile` with `action: "save"` to store it. The saved profile includes:
- A prose summary of your taste
- Your top genres
- Genres to avoid
- How many titles it was based on

The profile is used as context for every recommendation request. Re-generate it after logging a significant number of new titles.

## Getting Recommendations

Describe what you're in the mood for:

> **You:** I want something like Severance — weird, unsettling, with a mystery that unfolds slowly

Claude calls `watch-recommend` with your mood. This assembles your full context:
- Your taste profile
- Your preference statements
- Your streaming services
- Your complete watched list (so nothing is re-recommended)
- Your dismissed list

Claude then suggests 5-8 titles with a one-sentence reason for each, and calls `watch-lookup` on each to check streaming availability.

**More example prompts:**
- "Something light and funny for tonight"
- "A documentary that will blow my mind"
- "Best movies of 2025 I haven't seen"
- "Something my partner and I would both enjoy — she likes rom-coms, I like thrillers"

## Looking Up Where to Watch

Ask about any specific title:

> **You:** Where can I watch The Bear?

Claude calls `watch-lookup` and returns:
- Title, year, and type (movie/TV)
- TMDB rating and genres
- Plot overview
- **Stream on:** services offering it in your region (flatrate/subscription)
- **Rent on:** services offering rental
- **Buy on:** services offering purchase

You can specify a region if you're outside the US:

> **You:** Where can I watch Parasite in the UK?

Claude calls `watch-lookup` with `region: "GB"`.

## Admin Page Reference

**URL:** `https://your-worker.workers.dev/app?token=YOUR_TOKEN`

### Import Tab
- Upload a Netflix CSV to bulk import your watch history
- Shows import results (imported/skipped/failed counts)

### History Tab
- Shows a note directing you to use Claude chat for full history interaction
- History is stored in KV and accessed through the MCP tools

### Preferences Tab
- **Statements** — add or remove natural language preference statements
- **Streaming Services** — checkbox grid of 10 major services
- **Taste Profile** — view your current saved taste profile summary

The admin page authenticates using the same `ADMIN_KEY` used for MCP access. Your token is stored in the browser's `localStorage` after first use.
