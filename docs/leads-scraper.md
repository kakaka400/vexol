# Leads scraper

The Leads page shows the leads that the scraper agents find. Every project has its own Leads
page. Each platform of a project (Google Maps, TikTok, LinkedIn, Instagram, and any platform added
later) has its own agent, leads, scrape logs and statistics. The General tab shows the data of
all platforms of the project together.

## Data

The data is stored in the Supabase database named by `VEXOL_LEADS_DATABASE_URL`, in the schema
`scraper`. Run [`apps/api/src/leads/scraper.sql`](../apps/api/src/leads/scraper.sql) in the
Supabase SQL editor. It creates the tables and is safe to run again. The first time a project
opens its Leads page, the API creates the four default platforms for that project.

## Lead formats

Each platform has a lead format, set when it is added and changeable under **Platform**:

| Format   | A lead is                     | Fields                                                                  |
| -------- | ----------------------------- | ----------------------------------------------------------------------- |
| `email`  | a company and its email       | `email`, `name`, `sector`                                               |
| `social` | an account and its comment    | `handle`, `profileUrl`, `name`, `followers`, `comment`, `commentedAt`, `videoUrl`, `sector` |

Google Maps uses `email`; TikTok, LinkedIn and Instagram use `social`. The format decides the
columns of the leads table, the fields of the scrape form and the rules sent to the agent. A
platform stores an email (email format) or a handle (social format) once.

The scrape form of an email platform asks for region, niche and company size. The form of a
social platform also asks for related topics and hashtags, a lead signal (what a comment must
show), a maximum number of leads and extra instructions. The agent is told to treat the niche as
a topic and to search related keywords and hashtags as well.

| Table                 | Content                                                                          |
| --------------------- | -------------------------------------------------------------------------------- |
| `scraper.platforms`   | `project_id`, slug, name, active, lead format, agent instructions, `agent_id`    |
| `scraper.scrape_runs` | platform, region, niche, size, keywords, signal, max leads, notes, status, count |
| `scraper.leads`       | platform, scrape run, and the fields of the platform's lead format               |

Deleting a platform deletes its runs and leads. Deleting a scrape log either deletes its leads or
keeps them without a run; the dialog asks which.

```dotenv
VEXOL_LEADS_DATABASE_URL=postgresql://<role>:<password>@<host>:5432/postgres
```

Use the Session pooler connection string from Supabase (Connect). The direct connection is
IPv6-only. Percent-encode special characters in the password (`@` is `%40`). The role needs
select, insert, update and delete on the `scraper` tables.

`project_id` and `agent_id` are ids from one Vexol database. Give every Vexol instance its own
Supabase project (or database): a local development instance that shares the Supabase
database of the production site would read the leads of the production project with the same id.

## Agents and MCP

Every platform has one external agent in the Agents tab, named `<Platform> Scraper` with the
username `<slug>-scraper`. It acts under the project role `Lead scraper`, which is created on
first use and grants only the leads read, create and edit permissions. Renaming the platform
renames the agent; deleting the platform deletes the agent.

The agent connects to the project MCP endpoint, `API_URL/mcp`, with its own API key as
`Authorization: Bearer <key>`. MCP must be on for the project (MCP page). The agent sees only the
jobs of its own platform through these tools:

| Tool                  | Purpose                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| `list_scrape_jobs`    | queued and running jobs, with the form fields, instructions, format rules |
| `start_scrape_job`    | mark a job as running                                                    |
| `submit_scrape_leads` | add leads as the `leads` array, or as CSV for email platforms; repeatable |
| `finish_scrape_job`   | mark a job as `completed` or `failed` (with a reason)                    |

`submit_scrape_leads` applies the rules of the lead format: an email lead needs a valid email
and a name, a social lead needs a handle or a profile link. An email or handle the platform
already has keeps its first row. The response reports how many leads were added and skipped.

"Start scrape" on a platform dashboard creates a queued job. The agent has to call
`list_scrape_jobs` itself, so schedule it to check for jobs, for example every few minutes. The
dashboard refreshes while a job is queued or running.

## Add a platform

1. Open Leads and click **Add platform**. Enter a name, a slug, the lead format and the agent
   instructions.
2. The platform, its dashboard and its agent are created. Copy the API key from the dialog; it is
   shown only once. A new key can be issued from the Agents tab.
3. Connect the scraper agent to the MCP endpoint with that key. For Hermes:
   `hermes mcp add vexol-<slug> --url "<API_URL>/mcp" --auth header`, then enter the key at the
   prompt.
4. Turn on MCP for the project on the MCP page, if it is off.

The default platforms TikTok, LinkedIn and Instagram start inactive and without an agent. Turn one
on under **Platform** and click **Create agent** under **MCP connection**.

## CSV import and export

Leads, scrape logs and platforms each have an import and an export. An exported file can be
imported again.

| Data        | Columns                                                       |
| ----------- | ------------------------------------------------------------- |
| Leads, email  | `email,name,sector`                                                                     |
| Leads, social | `handle,profile_url,name,followers,comment,commented_at,video_url,sector`               |
| Scrape logs   | `created_at,platform,region,niche,scale,keywords,signal,max_leads,notes,status,lead_count` |
| Platforms     | `slug,name,active,lead_format,instructions`                                             |

A lead import goes into one platform and reads the columns of its lead format; on the General
tab the import button asks which platform. The General tab exports every column. A platform
import creates new slugs and updates the name, state and instructions of existing ones; it does
not create agents. A scrape log import skips rows whose platform slug does not exist.
