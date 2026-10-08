import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import postgres from 'postgres';
import { apiKeyApi, authedApi } from '../../../__tests__/helpers/app';
import { signUpTestUser } from '../../../__tests__/helpers/auth';
import { resetDb } from '../../../__tests__/helpers/db';

// The scraper tables live in their own schema of the leads database. The test points
// VEXOL_LEADS_DATABASE_URL at the test database, recreates the schema from scraper.sql
// before each test. A project gets the four default platforms on its first platform list.
const leadsDb = postgres(process.env.VEXOL_LEADS_DATABASE_URL!, { max: 1, onnotice: () => {} });
const schemaSql = await Bun.file(new URL('../../scraper.sql', import.meta.url)).text();

async function resetLeadsDb() {
  await leadsDb.unsafe('drop schema if exists scraper cascade');
  await leadsDb.unsafe(schemaSql);
}

afterAll(() => leadsDb.end());

async function setup() {
  const owner = await signUpTestUser();
  const asOwner = authedApi(owner.cookie);
  await asOwner.projects.post({ key: 'VEX', name: 'Vexol' });
  const leads = asOwner.projects({ projectKey: 'VEX' }).leads;
  const platforms = (await leads.platforms.get()).data!;
  const googleMaps = platforms.find((p) => p.slug === 'google-maps')!;
  return { asOwner, leads, platforms, googleMaps };
}

async function connectAgent(setupResult: Awaited<ReturnType<typeof setup>>) {
  const { leads, googleMaps } = setupResult;
  const connected = await leads.platforms({ platformId: googleMaps.id }).agent.post();
  expect(connected.status).toBe(200);
  // Wrapped in an object: a Treaty client is thenable, so awaiting it directly never settles.
  return { asAgent: apiKeyApi(connected.data!.apiKey).projects({ projectKey: 'VEX' }).leads };
}

describe('Leads scraper', () => {
  beforeEach(async () => {
    await resetDb();
    await resetLeadsDb();
  });

  it('lists the default platforms in order', async () => {
    const { platforms } = await setup();
    expect(platforms.map((p) => [p.slug, p.active, p.leadFormat, p.agent])).toEqual([
      ['google-maps', true, 'email', null],
      ['tiktok', false, 'social', null],
      ['linkedin', false, 'social', null],
      ['instagram', false, 'social', null],
    ]);
  });

  it('does not bring back a deleted default platform', async () => {
    const s = await setup();
    const tiktok = s.platforms.find((p) => p.slug === 'tiktok')!;
    await s.leads.platforms({ platformId: tiktok.id }).delete();
    const after = (await s.leads.platforms.get()).data!;
    expect(after.map((p) => p.slug)).toEqual(['google-maps', 'linkedin', 'instagram']);
  });

  it('runs a social scrape job with structured leads', async () => {
    const s = await setup();
    const tiktok = s.platforms.find((p) => p.slug === 'tiktok')!;
    await s.leads.platforms({ platformId: tiktok.id }).patch({ active: true });
    const connected = await s.leads.platforms({ platformId: tiktok.id }).agent.post();
    const asAgent = apiKeyApi(connected.data!.apiKey).projects({ projectKey: 'VEX' }).leads;

    const run = await s.leads.runs.post({
      platformId: tiktok.id,
      region: 'Worldwide, English',
      niche: 'Software',
      scale: '100-10k followers',
      keywords: 'SaaS, B2B, no-code',
      signal: 'Asks how to get first customers',
      maxLeads: 50,
      notes: 'Skip agencies',
    });
    expect(run.data).toMatchObject({ leadFormat: 'social', keywords: 'SaaS, B2B, no-code' });

    const [job] = (await asAgent.jobs.get()).data!;
    expect(job).toMatchObject({
      leadFormat: 'social',
      signal: 'Asks how to get first customers',
      maxLeads: 50,
      notes: 'Skip agencies',
    });
    expect(job.formatRules).toContain('Treat the niche as a topic');

    const submitted = await asAgent.jobs({ runId: job.id }).leads.post({
      leads: [
        {
          profileUrl: 'https://www.tiktok.com/@JaneDoe',
          name: 'Jane',
          followers: '12.5k',
          comment: 'How do I find my first SaaS customers, without ads?',
          commentedAt: '2026-10-01T12:30:00Z',
          videoUrl: 'https://www.tiktok.com/@creator/video/123',
          sector: 'SaaS',
        },
        { handle: '@janedoe', comment: 'Second comment of the same account' },
        { name: 'No account given' },
        { handle: 'mark.dev', followers: 800 },
      ],
    });
    expect(submitted.data).toEqual({ added: 2, skipped: 2 });

    const leads = (await s.leads.get({ query: { platformId: tiktok.id } })).data!;
    expect(
      leads.map((l) => [l.handle, l.email, l.followers, l.comment, l.commentedAt?.toString()]),
    ).toEqual([
      [
        'janedoe',
        null,
        12500,
        'How do I find my first SaaS customers, without ads?',
        new Date('2026-10-01T12:30:00Z').toString(),
      ],
      ['mark.dev', null, 800, null, undefined],
    ]);
    expect(leads[0]).toMatchObject({
      name: 'Jane',
      profileUrl: 'https://www.tiktok.com/@JaneDoe',
      videoUrl: 'https://www.tiktok.com/@creator/video/123',
    });

    const missing = await asAgent.jobs({ runId: job.id }).leads.post({});
    expect(missing.status).toBe(400);
  });

  it('imports social leads from CSV', async () => {
    const s = await setup();
    const tiktok = s.platforms.find((p) => p.slug === 'tiktok')!;
    const imported = await s.leads.import.post({
      platformId: tiktok.id,
      csv: 'handle,profile_url,name,followers,comment,commented_at,video_url,sector\nann,https://www.tiktok.com/@ann,Ann,1200,"Need help, badly",2026-10-02,,SaaS\n,,,,,,,\n',
    });
    expect(imported.data).toEqual({ created: 1, updated: 0, skipped: 0 });
    const [lead] = (await s.leads.get({ query: { platformId: tiktok.id } })).data!;
    expect(lead).toMatchObject({ handle: 'ann', followers: 1200, comment: 'Need help, badly' });
  });

  it('creates the platform agent in the Agents tab', async () => {
    const s = await setup();
    await connectAgent(s);

    const agents = await s.asOwner.projects({ projectKey: 'VEX' })['ai-agents'].get();
    expect(agents.data).toHaveLength(1);
    expect(agents.data![0]).toMatchObject({
      name: 'Google Maps Scraper',
      username: 'google-maps-scraper',
      kind: 'external',
    });

    const again = await s.leads.platforms({ platformId: s.googleMaps.id }).agent.post();
    expect(again.status).toBe(409);

    await s.leads.platforms({ platformId: s.googleMaps.id }).patch({ name: 'Maps' });
    const renamed = await s.asOwner.projects({ projectKey: 'VEX' })['ai-agents'].get();
    expect(renamed.data![0].name).toBe('Maps Scraper');
  });

  it('adds a platform with its agent and deletes both', async () => {
    const { asOwner, leads } = await setup();
    const created = await leads.platforms.post({ name: 'Facebook', slug: 'facebook' });
    expect(created.status).toBe(201);
    expect(created.data!.platform).toMatchObject({ slug: 'facebook', active: true });
    expect(created.data!.platform.agent).toMatchObject({ username: 'facebook-scraper' });
    expect(created.data!.apiKey.length).toBeGreaterThan(10);

    const duplicate = await leads.platforms.post({ name: 'Facebook', slug: 'facebook' });
    expect(duplicate.status).toBe(409);
    const badSlug = await leads.platforms.post({ name: 'X', slug: 'Bad Slug' });
    expect(badSlug.status).toBe(400);

    const removed = await leads.platforms({ platformId: created.data!.platform.id }).delete();
    expect(removed.status).toBe(204);
    const agents = await asOwner.projects({ projectKey: 'VEX' })['ai-agents'].get();
    expect(agents.data).toHaveLength(0);
  });

  it('runs a scrape job from the form through the agent tools', async () => {
    const s = await setup();
    const noAgent = await s.leads.runs.post({
      platformId: s.googleMaps.id,
      region: 'Arnhem',
      niche: 'Accountants',
      scale: '5-50 employees',
    });
    expect(noAgent.status).toBe(409);

    const { asAgent } = await connectAgent(s);
    const run = await s.leads.runs.post({
      platformId: s.googleMaps.id,
      region: 'Arnhem',
      niche: 'Accountants',
      scale: '5-50 employees',
    });
    expect(run.status).toBe(201);
    expect(run.data).toMatchObject({ status: 'queued', leadCount: 0, platformSlug: 'google-maps' });
    const runId = run.data!.id;

    const jobs = await asAgent.jobs.get();
    expect(jobs.data).toHaveLength(1);
    expect(jobs.data![0]).toMatchObject({ id: runId, region: 'Arnhem', niche: 'Accountants' });
    expect(jobs.data![0].formatRules).toContain('email,name,sector');

    await asAgent.jobs({ runId }).start.post();
    const submitted = await asAgent.jobs({ runId }).leads.post({
      csv: [
        'email,name,sector',
        'INFO@Example.nl,Example Accountants,Accountants',
        'mailto:info@example.nl,Duplicate,Accountants',
        'info [at] broken.nl,Broken,Bouw',
        'hello@logistics.nl,"Logistics, Transport & Storage",',
      ].join('\n'),
    });
    expect(submitted.data).toEqual({ added: 2, skipped: 2 });

    await asAgent.jobs({ runId }).finish.post({ status: 'completed' });
    const [finished] = (await s.leads.runs.get({ query: {} })).data!;
    expect(finished).toMatchObject({ status: 'completed', leadCount: 2 });
    expect(await asAgent.jobs.get().then((r) => r.data)).toHaveLength(0);

    const list = await s.leads.get({ query: { runId } });
    expect(list.data!.map((l) => [l.email, l.name, l.sector])).toEqual([
      ['info@example.nl', 'Example Accountants', 'Accountants'],
      ['hello@logistics.nl', 'Logistics, Transport & Storage', null],
    ]);
  });

  it('refuses job tools to a session user and to another platform', async () => {
    const s = await setup();
    const { asAgent } = await connectAgent(s);
    const asOwnerJobs = await s.leads.jobs.get();
    expect(asOwnerJobs.status).toBe(403);

    const tiktok = s.platforms.find((p) => p.slug === 'tiktok')!;
    await s.leads.platforms({ platformId: tiktok.id }).patch({ active: true });
    await s.leads.platforms({ platformId: tiktok.id }).agent.post();
    const other = await s.leads.runs.post({
      platformId: tiktok.id,
      region: 'Utrecht',
      niche: 'Bakers',
      scale: 'small',
    });
    const foreign = await asAgent.jobs({ runId: other.data!.id }).start.post();
    expect(foreign.status).toBe(404);
  });

  it('refuses a scrape on an inactive platform', async () => {
    const s = await setup();
    const tiktok = s.platforms.find((p) => p.slug === 'tiktok')!;
    const run = await s.leads.runs.post({
      platformId: tiktok.id,
      region: 'Utrecht',
      niche: 'Bakers',
      scale: 'small',
    });
    expect(run.status).toBe(409);
  });

  it('imports, bulk deletes and keeps or deletes leads with a run', async () => {
    const s = await setup();
    const imported = await s.leads.import.post({
      platformId: s.googleMaps.id,
      csv: 'email,name,sector\na@one.nl,One,Bouw\nb@two.nl,Two,Bouw\nnot-an-email,Three,Bouw\n',
    });
    expect(imported.data).toEqual({ created: 2, updated: 0, skipped: 1 });

    const leads = (await s.leads.get({ query: {} })).data!;
    const deleted = await s.leads.delete.post({ ids: [leads[0].id] });
    expect(deleted.data).toEqual({ deleted: 1 });
    expect((await s.leads.get({ query: {} })).data).toHaveLength(1);

    const { asAgent } = await connectAgent(s);
    const makeRun = async () => {
      const run = await s.leads.runs.post({
        platformId: s.googleMaps.id,
        region: 'Ede',
        niche: 'Bouw',
        scale: 'any',
      });
      return run.data!.id;
    };
    const keepRun = await makeRun();
    await asAgent
      .jobs({ runId: keepRun })
      .leads.post({ csv: 'email,name,sector\nc@three.nl,Three,' });
    const dropRun = await makeRun();
    await asAgent
      .jobs({ runId: dropRun })
      .leads.post({ csv: 'email,name,sector\nd@four.nl,Four,' });

    await s.leads.runs({ runId: keepRun }).delete(undefined, { query: { deleteLeads: false } });
    await s.leads.runs({ runId: dropRun }).delete(undefined, { query: { deleteLeads: true } });
    const remaining = (await s.leads.get({ query: {} })).data!;
    expect(remaining.map((l) => [l.email, l.scrapeRunId])).toEqual([
      ['b@two.nl', null],
      ['c@three.nl', null],
    ]);
  });

  it('imports platforms and scrape logs from CSV', async () => {
    const { leads } = await setup();
    const platforms = await leads.platforms.import.post({
      csv: 'slug,name,active,instructions\ntiktok,TikTok,true,Find creators\nyoutube,YouTube,false,\nBad Slug,X,true,\n',
    });
    expect(platforms.data).toEqual({ created: 1, updated: 1, skipped: 1 });

    const runs = await leads.runs.import.post({
      csv: 'created_at,platform,region,niche,scale,status,lead_count\n2026-01-02T10:00:00.000Z,google-maps,Arnhem,Bouw,small,completed,12\n,unknown,X,Y,Z,completed,1\n',
    });
    expect(runs.data).toEqual({ created: 1, updated: 0, skipped: 1 });
    const [run] = (await leads.runs.get({ query: {} })).data!;
    expect(run).toMatchObject({ region: 'Arnhem', leadCount: 12, status: 'completed' });
  });

  it('keeps the platforms, leads and runs of each project apart', async () => {
    const s = await setup();
    await s.leads.import.post({
      platformId: s.googleMaps.id,
      csv: 'email,name,sector\na@one.nl,One,Bouw\n',
    });
    await s.leads.platforms.post({ name: 'Facebook', slug: 'facebook' });

    await s.asOwner.projects.post({ key: 'MKT', name: 'Marketing' });
    const other = s.asOwner.projects({ projectKey: 'MKT' }).leads;
    const otherPlatforms = (await other.platforms.get()).data!;
    expect(otherPlatforms.map((p) => [p.slug, p.leadCount])).toEqual([
      ['google-maps', 0],
      ['tiktok', 0],
      ['linkedin', 0],
      ['instagram', 0],
    ]);
    expect((await other.get({ query: {} })).data).toHaveLength(0);

    const foreignPlatform = await other.platforms({ platformId: s.googleMaps.id }).patch({
      name: 'Taken',
    });
    expect(foreignPlatform.status).toBe(404);
    const foreignImport = await other.import.post({
      platformId: s.googleMaps.id,
      csv: 'email,name,sector\nb@two.nl,Two,Bouw\n',
    });
    expect(foreignImport.status).toBe(404);

    const [lead] = (await s.leads.get({ query: {} })).data!;
    expect((await other.delete.post({ ids: [lead.id] })).data).toEqual({ deleted: 0 });
    expect((await s.leads.get({ query: {} })).data).toHaveLength(1);
  });

  it('denies a member without leads access', async () => {
    await setup();
    const member = await signUpTestUser();
    const res = await authedApi(member.cookie)
      .projects({ projectKey: 'VEX' })
      .leads.platforms.get();
    expect(res.status).toBe(403);
  });
});
