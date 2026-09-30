import { beforeEach, describe, expect, it } from 'bun:test';
import { authedApi } from '../../../__tests__/helpers/app';
import { signUpTestUser } from '../../../__tests__/helpers/auth';
import { resetDb } from '../../../__tests__/helpers/db';
import { TEST_PNG } from '../../../__tests__/helpers/images';

function png(name = 'template.png') {
  return new File([TEST_PNG], name, { type: 'image/png' });
}

async function setupProject() {
  const owner = await signUpTestUser();
  const asOwner = authedApi(owner.cookie);
  await asOwner.projects.post({ key: 'MKT', name: 'Marketing' });
  return { asOwner, studio: asOwner.projects({ projectKey: 'MKT' }).studio };
}

describe('Studio templates', () => {
  beforeEach(resetDb);

  it('lists six empty slots for a new project', async () => {
    const { studio } = await setupProject();
    const list = await studio.templates.get();
    expect(list.status).toBe(200);
    expect(list.data!.map((template) => template.slot)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(list.data!.every((template) => template.photoId === null)).toBe(true);
  });

  it('names a slot and describes it', async () => {
    const { studio } = await setupProject();
    const saved = await studio.templates({ slot: 3 }).patch({
      name: 'Quote',
      description: 'A quote on a dark background.',
    });
    expect(saved.status).toBe(200);
    expect(saved.data).toMatchObject({ slot: 3, name: 'Quote', photoId: null });

    const list = await studio.templates.get();
    expect(list.data![2]).toMatchObject({
      name: 'Quote',
      description: 'A quote on a dark background.',
    });
  });

  it('rejects a name over 80 characters and a slot outside 1 to 6', async () => {
    const { studio } = await setupProject();
    expect((await studio.templates({ slot: 1 }).patch({ name: 'x'.repeat(80) })).status).toBe(200);
    expect((await studio.templates({ slot: 1 }).patch({ name: 'x'.repeat(81) })).status).toBe(400);
    expect((await studio.templates({ slot: 0 }).patch({ name: 'A' })).status).toBe(400);
    expect((await studio.templates({ slot: 7 }).patch({ name: 'A' })).status).toBe(400);
  });

  it('stores an uploaded photo in the vault and replaces it on a second upload', async () => {
    const { asOwner, studio } = await setupProject();
    const first = await studio.templates({ slot: 1 }).photo.post({ file: png() });
    expect(first.status).toBe(200);
    expect(first.data!.photoId).toEqual(expect.any(String));

    const second = await studio.templates({ slot: 1 }).photo.post({ file: png() });
    expect(second.data!.photoId).not.toBe(first.data!.photoId);

    const files = await asOwner.projects({ projectKey: 'MKT' }).files.get();
    const templateFiles = files.data!.filter((file) => file.folder === 'Studio templates');
    expect(templateFiles.map((file) => file.id)).toEqual([second.data!.photoId!]);
  });

  it('refuses a file that is not a PNG, JPEG or WebP image', async () => {
    const { studio } = await setupProject();
    const fake = new File(['not an image'], 'fake.png', { type: 'image/png' });
    const res = await studio.templates({ slot: 1 }).photo.post({ file: fake });
    expect(res.status).toBe(400);
  });

  it('keeps a non-member out', async () => {
    await setupProject();
    const outsider = authedApi((await signUpTestUser()).cookie);
    const res = await outsider.projects({ projectKey: 'MKT' }).studio.templates.get();
    expect(res.status).toBe(403);
  });
});

describe('Studio posts', () => {
  beforeEach(resetDb);

  it('starts with no posts', async () => {
    const { studio } = await setupProject();
    const list = await studio.posts.get();
    expect(list.status).toBe(200);
    expect(list.data).toEqual([]);
  });

  it('404s on deleting a post that does not exist', async () => {
    const { asOwner } = await setupProject();
    const res = await asOwner.studio.posts({ publicId: crypto.randomUUID() }).delete();
    expect(res.status).toBe(404);
  });

  it('404s on the public image of a post that does not exist', async () => {
    const { asOwner } = await setupProject();
    const res = await asOwner.studio.posts({ publicId: crypto.randomUUID() }).image.get();
    expect(res.status).toBe(404);
  });
});
