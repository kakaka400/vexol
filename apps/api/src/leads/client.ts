import postgres from 'postgres';
import { HttpError } from '../shared/lib';

export type LeadsSql = ReturnType<typeof postgres>;

let client: LeadsSql | null = null;

// The leads database is the Supabase project of the scraper agents (schema `scraper`,
// see scraper.sql). Supabase requires TLS; a local Postgres is reached with
// `?sslmode=disable` in the URL.
function leadsClient(): LeadsSql {
  const url = process.env.VEXOL_LEADS_DATABASE_URL;
  if (!url) throw new HttpError(503, 'Leads data source is not configured');
  const ssl =
    process.env.NODE_ENV === 'test' || url.includes('sslmode=disable') ? false : 'require';
  client ??= postgres(url, {
    max: 4,
    connect_timeout: 10,
    idle_timeout: 20,
    prepare: false,
    ssl,
    connection: { application_name: 'itsaplan-leads', statement_timeout: 15000 },
  });
  return client;
}

export async function withLeads<T>(run: (sql: LeadsSql) => Promise<T>): Promise<T> {
  try {
    return await run(leadsClient());
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (process.env.NODE_ENV === 'test') throw error;
    console.error('[leads]', error);
    throw new HttpError(503, 'Leads data is temporarily unavailable');
  }
}
