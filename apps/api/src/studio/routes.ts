import { Elysia, t } from 'elysia';
import { authContext } from '../shared/auth-context';
import { requireUser } from '../shared/access';
import { entityGuard, guards } from '../shared/guards';
import { HttpError } from '../shared/lib';
import { noContent } from '../shared/http';
import { ErrorResponse } from '../shared/responses';
import { getObject } from '../shared/s3';
import { assertUploadAllowed } from '../shared/uploads';
import { mcpTool } from '../mcp/generate';
import {
  discardStudioFile,
  generateStudioPost,
  isStudioImageType,
  MAX_INSTRUCTION_LENGTH,
  storeStudioFile,
  studioExtension,
  TEMPLATE_FOLDER,
} from './generate';
import {
  deleteStudioPost,
  getStudioPostProjectId,
  getStudioTemplate,
  listStudioPosts,
  listStudioTemplates,
  saveStudioTemplate,
  studioPostImage,
  studioTemplateSource,
} from './store';
import { postDto } from './dto';

const projectParams = t.Object({ projectKey: t.String() });
const slotParams = t.Object({
  projectKey: t.String(),
  slot: t.Numeric({ minimum: 1, maximum: 6, multipleOf: 1 }),
});
const idParams = t.Object({ publicId: t.String({ format: 'uuid' }) });

const TemplateResponse = t.Object({
  slot: t.Number(),
  name: t.String(),
  description: t.String(),
  photoId: t.Nullable(t.String()),
  updatedAt: t.Nullable(t.String()),
});

const PostResponse = t.Object({
  id: t.String(),
  slot: t.Number(),
  templateName: t.String(),
  instruction: t.String(),
  imageUrl: t.Nullable(t.String()),
  createdByName: t.Nullable(t.String()),
  createdAt: t.String(),
});

// The first bytes of each accepted type, so a file cannot claim to be an image it
// is not.
function sniffImageType(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export const studioRoutes = new Elysia({ name: 'studio', detail: { tags: ['Studio'] } })
  .use(authContext)
  .use(guards)
  .macro({
    studioPost: entityGuard('studio', 'Post not found', (params) =>
      getStudioPostProjectId(params.publicId),
    ),
  })

  .get(
    '/projects/:projectKey/studio/templates',
    async ({ project }) => listStudioTemplates(project.id),
    {
      params: projectParams,
      permission: ['studio', 'read'],
      response: {
        200: t.Array(TemplateResponse),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: 'List the six template slots of a project',
        description:
          'List the six Studio templates. Each is a photo that create_studio_post edits; the description says what it is for. A slot without a photo cannot be used yet.',
        ...mcpTool('list_studio_templates'),
      },
    },
  )

  .patch(
    '/projects/:projectKey/studio/templates/:slot',
    async ({ project, params, body }) => {
      await saveStudioTemplate(project.id, params.slot, {
        name: body.name?.trim(),
        description: body.description?.trim(),
      });
      const row = await getStudioTemplate(project.id, params.slot);
      if (!row) throw new HttpError(404, 'Template not found');
      return row;
    },
    {
      params: slotParams,
      permission: ['studio', 'edit'],
      body: t.Object({
        name: t.Optional(t.String({ maxLength: 80 })),
        description: t.Optional(t.String({ maxLength: 500 })),
      }),
      response: {
        200: TemplateResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: { summary: 'Rename a template slot or change its description' },
    },
  )

  .post(
    '/projects/:projectKey/studio/templates/:slot/photo',
    async ({ project, params, body, user }) => {
      const file = body.file;
      if (!(file instanceof File)) throw new HttpError(400, 'No file uploaded (form field "file")');
      if (file.size === 0) throw new HttpError(400, 'Uploaded file is empty');

      // Checked against the limits before the upload is held in memory.
      await assertUploadAllowed(project.id, file.size, file.type || 'image/png');
      const bytes = Buffer.from(await file.arrayBuffer());
      const contentType = sniffImageType(bytes);
      if (!contentType || !isStudioImageType(contentType)) {
        throw new HttpError(400, 'The template photo must be a PNG, JPEG or WebP image');
      }

      const previous = (await studioTemplateSource(project.id, params.slot))?.photoFileId ?? null;
      const photoFileId = await storeStudioFile({
        projectId: project.id,
        userId: requireUser(user).id,
        folder: TEMPLATE_FOLDER,
        filename: `template-${params.slot}.${studioExtension(contentType)}`,
        bytes,
        contentType,
      });
      await saveStudioTemplate(project.id, params.slot, { photoFileId });
      await discardStudioFile(previous);

      const row = await getStudioTemplate(project.id, params.slot);
      if (!row) throw new HttpError(404, 'Template not found');
      return row;
    },
    {
      params: slotParams,
      permission: ['studio', 'edit'],
      body: t.Object({ file: t.File() }),
      response: {
        200: TemplateResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        413: ErrorResponse,
        502: ErrorResponse,
      },
      detail: { summary: 'Upload or replace the photo of a template slot' },
    },
  )

  .get(
    '/projects/:projectKey/studio/posts',
    async ({ project }) => (await listStudioPosts(project.id)).map(postDto),
    {
      params: projectParams,
      permission: ['studio', 'read'],
      response: {
        200: t.Array(PostResponse),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: 'List the images generated from the templates, newest first',
        ...mcpTool('list_studio_posts'),
      },
    },
  )

  .post(
    '/projects/:projectKey/studio/posts',
    async ({ project, body, user, set }) => {
      const post = await generateStudioPost({
        projectId: project.id,
        slot: body.slot,
        instruction: body.instruction,
        userId: requireUser(user).id,
      });
      set.status = 201;
      return postDto(post);
    },
    {
      params: projectParams,
      permission: ['studio', 'create'],
      body: t.Object({
        slot: t.Integer({ minimum: 1, maximum: 6 }),
        instruction: t.String({ minLength: 1, maxLength: MAX_INSTRUCTION_LENGTH }),
      }),
      response: {
        201: PostResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        413: ErrorResponse,
        502: ErrorResponse,
      },
      detail: {
        summary: 'Generate an image from a template',
        description:
          'Generate a new image by editing the photo of one Studio template with an instruction: the text to put on it or what to change. The template keeps its layout and style. Returns the image with a public URL. Takes up to two minutes.',
        ...mcpTool('create_studio_post', { openWorldHint: true }),
      },
    },
  )

  .delete(
    '/studio/posts/:publicId',
    async ({ params }) => {
      const { imageFileId } = await deleteStudioPost(params.publicId);
      await discardStudioFile(imageFileId);
      return noContent();
    },
    {
      params: idParams,
      studioPost: 'delete',
      response: {
        204: t.Void(),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        409: ErrorResponse,
      },
      detail: { summary: 'Delete a generated image' },
    },
  )

  // Public: a chat client such as Telegram fetches this itself, without a session.
  // The publicId is an unguessable uuid, and only the three image types Studio
  // stores are ever served, inline and with a locked-down CSP.
  .get(
    '/studio/posts/:publicId/image',
    async ({ params }) => {
      const image = await studioPostImage(params.publicId);
      if (!image || !isStudioImageType(image.contentType)) {
        throw new HttpError(404, 'Image not found');
      }
      let object;
      try {
        object = await getObject(image.key);
      } catch {
        throw new HttpError(404, 'Image not found');
      }
      const headers: Record<string, string> = {
        'Content-Type': image.contentType,
        'Content-Disposition': 'inline',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=31536000, immutable',
      };
      if (object.contentLength != null) headers['Content-Length'] = String(object.contentLength);
      return new Response(object.body, { headers });
    },
    {
      params: idParams,
      response: { 404: ErrorResponse },
      detail: { summary: 'The image of a generated post (public)' },
    },
  );
