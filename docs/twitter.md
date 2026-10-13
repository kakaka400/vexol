# Twitter

Growth → Social → Twitter (`/project/<KEY>/social/twitter`) collects public posts from X,
writes every result to the Obsidian vault, and turns them into posts that a person
confirms before Buffer publishes them.

## Research

A research run takes a question, handles, profile or post URLs, search terms, hashtags,
a period, a language, a result limit, replies, tags and project context. It reads only
public data, through three Apify Actors (the **Apify X Scraper**):

| Input                          | Actor                                 |
| ------------------------------ | ------------------------------------- |
| question, search terms, hashtags | `scraper_one/x-posts-search`        |
| handles, profile URLs          | `scraper_one/x-profile-posts-scraper` |
| post URLs (and their replies)  | `scraper_one/x-post-replies-scraper`  |

The API starts the Actor, waits until it finishes (`APIFY_RUN_TIMEOUT_MS`, then the run
is aborted), reads its default dataset, and normalizes and deduplicates the posts. Every
Actor run is capped to the results the research run still needs (`maxItems`). The run ID,
dataset ID, status and error of each Actor run are written to Activity
(`twitter.apify.run`).

The token is the project's **Apify X Scraper** credential (Settings → Integrations), or
`APIFY_TOKEN` on the API for projects without one. It is read only by the API and never
sent to the browser. Without a token research does not run; there is no other source.
A 401, 402, 403 or 429 from Apify stops the run (status `stopped`); it is not retried
and not routed around. A run that only timed out is queued again, up to three times,
with backoff. The worker executes queued runs (`/internal/twitter/sweep`).

Posts are deduplicated per project by post id, then canonical URL, then a content hash
of author and text. A newer reading only updates metrics and fills empty fields.

## Obsidian

Notes are written under `OBSIDIAN_VAULT_DIR/Socials/Twitter`:

```text
Socials/Twitter/
  Dashboard.md
  Research Runs/YYYY/MM/YYYY-MM-DD--<query-slug>--<run-id>.md
  Posts/<post-id-or-hash>.md
  Profiles/<handle>.md
  Drafts/<draft-id>.md
  Published/<buffer-post-id>.md
```

Every write is a job in `obsidian_ingest_job`, created in the same transaction as the
data. The worker renders the note from the current rows, writes it to a temporary
file, renames it over the target and reads it back. A run counts as stored only when
its note and every item note are confirmed. Failed writes are retried with backoff;
after five attempts, or on a permanent error, the job is failed and shown in Activity,
where "Write failed notes again" requests it again.

## Publishing

Drafts hold one post or a thread in immutable versions, with the research items they
use as sources. Publishing goes through the project's Buffer key (Buffer GraphQL API,
`https://api.buffer.com`); a thread is one Buffer post with `metadata.twitter.thread`.
A person checks the version (`validate`), confirms the preview, and then schedules or
publishes; the request carries the confirmed content hash. Agents get 403. Buffer has
no idempotency key, so a retry after a timeout first looks on the channel for a post
with the same text created since the unanswered attempt, and sends again only when
there is none. Publishing needs the `twitter_publish.create` permission, separate from
research.

## MCP

Two endpoints, each with its own tool set, authenticated with an external agent's API
key (`Authorization: Bearer <key>`), and only for projects with MCP turned on:

| Endpoint                   | Tools                                                                                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /mcp/twitter-research` | `search_twitter`, `fetch_twitter_profile`, `fetch_twitter_post`, `run_twitter_research`, `get_research_run`, `ingest_research_results`                                                                                                                |
| `POST /mcp/twitter-agent`    | `list_research_items`, `create_twitter_draft`, `revise_twitter_draft`, `generate_thread`, `generate_variations`, `preview_twitter_post`, `list_publish_channels`, `validate_publish_post`, `schedule_twitter_post`, `publish_twitter_post`, `get_publish_status`, `list_twitter_activity` |

Every call is written to the project's Twitter activity log.

## Setup

1. Set `OBSIDIAN_VAULT_DIR` on the API (and `OBSIDIAN_VAULT_NAME` when the vault is
   named differently from that folder, for `obsidian://` links).
2. In the project, add a **Buffer** credential (API key from Buffer → Settings → API) under
   Settings → Integrations, and connect the X account as a channel in Buffer. Add an
   **Apify X Scraper** credential (API token), or set `APIFY_TOKEN` on the API; research
   needs one of them. A research agent can also store posts it found itself with
   `ingest_research_results`.
3. Give members roles with `twitter` (research, library, drafts) and, for those who may
   publish, `twitter_publish.create`.
4. For agents: create an external agent per endpoint (for example a research agent with
   `twitter.read` + `twitter.create`, a writer with `twitter.read/create/edit`), turn MCP on
   for the project, and add the endpoint to the agent's MCP client with its API key.
