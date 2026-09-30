import { callOpenRouter, projectOpenRouterKey } from '../integrations/openrouter';
import { createProjectFile, deleteProjectFileById } from '../files/store';
import { HttpError } from '../shared/lib';
import { getObject } from '../shared/s3';
import {
  assertUploadAllowed,
  discardUploadedObject,
  storeUploadedObject,
  uploadObjectKey,
} from '../shared/uploads';
import { createStudioPost, studioTemplateSource, type StudioPostRow } from './store';

// Verified against the OpenRouter catalogue: it takes an image as input and
// returns one.
const IMAGE_MODEL = 'google/gemini-3.1-flash-image';
const REQUEST_TIMEOUT_MS = 120_000;
export const MAX_INSTRUCTION_LENGTH = 2_000;

// The only image types Studio stores. A generated post is served on a public
// route, so its type must be one a browser renders as an image and nothing else.
export const STUDIO_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const TEMPLATE_FOLDER = 'Studio templates';
const POST_FOLDER = 'Studio';

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export function isStudioImageType(value: string): boolean {
  return (STUDIO_IMAGE_TYPES as readonly string[]).includes(value);
}

export function studioExtension(contentType: string): string {
  return EXTENSIONS[contentType] ?? 'png';
}

// Stores bytes as an ordinary vault file, so everything Studio holds is also
// visible in Files. Returns the file row id.
export async function storeStudioFile(input: {
  projectId: number;
  userId: string | null;
  folder: string;
  filename: string;
  bytes: Buffer;
  contentType: string;
}): Promise<number> {
  const key = uploadObjectKey(input.projectId, 'files', input.filename);
  await storeUploadedObject(key, input.bytes, input.contentType);
  try {
    const file = await createProjectFile({
      projectId: input.projectId,
      uploadedByUserId: input.userId,
      s3Key: key,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.bytes.length,
      folder: input.folder,
    });
    return file.id;
  } catch (error) {
    await discardUploadedObject(key);
    throw error;
  }
}

export async function discardStudioFile(fileId: number | null): Promise<void> {
  if (fileId == null) return;
  const key = await deleteProjectFileById(fileId);
  if (key) await discardUploadedObject(key);
}

async function readObject(key: string): Promise<Buffer> {
  const { body } = await getObject(key);
  return Buffer.from(await new Response(body).arrayBuffer());
}

// The instruction is framed so the model edits the template rather than
// inventing a new picture: the template is the design, the instruction the change.
function editPrompt(instruction: string): string {
  return [
    'Edit the provided template image.',
    'Keep its layout, composition, typography style, colours and branding.',
    'Change only what the instruction below asks for.',
    '',
    `Instruction: ${instruction}`,
  ].join('\n');
}

async function editPhoto(
  apiKey: string,
  photo: Buffer,
  photoType: string,
  instruction: string,
): Promise<{ bytes: Buffer; contentType: string }> {
  const payload = (await callOpenRouter(
    '/images',
    apiKey,
    {
      model: IMAGE_MODEL,
      prompt: editPrompt(instruction),
      input_references: [
        {
          type: 'image_url',
          image_url: { url: `data:${photoType};base64,${photo.toString('base64')}` },
        },
      ],
      n: 1,
    },
    REQUEST_TIMEOUT_MS,
  )) as { data?: { b64_json?: string; media_type?: string }[] };

  const first = payload.data?.[0];
  if (!first?.b64_json) throw new HttpError(502, 'OpenRouter returned no image');
  const contentType = first.media_type ?? 'image/png';
  if (!isStudioImageType(contentType)) {
    throw new HttpError(502, `OpenRouter returned an unsupported image type: ${contentType}`);
  }
  return { bytes: Buffer.from(first.b64_json, 'base64'), contentType };
}

// Edits the photo of one template slot with an instruction, stores the result in
// the vault and records it as a post.
export async function generateStudioPost(input: {
  projectId: number;
  slot: number;
  instruction: string;
  userId: string | null;
}): Promise<StudioPostRow> {
  const instruction = input.instruction.trim();
  if (!instruction) throw new HttpError(400, 'The instruction is empty');
  if (instruction.length > MAX_INSTRUCTION_LENGTH) {
    throw new HttpError(400, `The instruction is longer than ${MAX_INSTRUCTION_LENGTH} characters`);
  }

  const template = await studioTemplateSource(input.projectId, input.slot);
  if (!template?.photoKey || !template.photoType) {
    throw new HttpError(400, `Template ${input.slot} has no photo yet`);
  }

  const apiKey = await projectOpenRouterKey(input.projectId);
  const image = await editPhoto(
    apiKey,
    await readObject(template.photoKey),
    template.photoType,
    instruction,
  );
  await assertUploadAllowed(input.projectId, image.bytes.length, image.contentType);

  const fileId = await storeStudioFile({
    projectId: input.projectId,
    userId: input.userId,
    folder: POST_FOLDER,
    filename: `template-${input.slot}-${Date.now()}.${studioExtension(image.contentType)}`,
    bytes: image.bytes,
    contentType: image.contentType,
  });
  try {
    return await createStudioPost({
      projectId: input.projectId,
      templateId: template.id,
      instruction,
      imageFileId: fileId,
      createdByUserId: input.userId,
    });
  } catch (error) {
    await discardStudioFile(fileId);
    throw error;
  }
}
