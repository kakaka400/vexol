import type { StudioPostRow } from './store';

// The public address of a post's image. It is absolute because an agent hands it
// to a chat client that fetches it from outside.
export function studioImageUrl(publicId: string): string {
  return `${process.env.API_URL ?? ''}/studio/posts/${publicId}/image`;
}

export function postDto(row: StudioPostRow) {
  return {
    id: row.publicId,
    slot: row.slot,
    templateName: row.templateName,
    instruction: row.instruction,
    imageUrl: row.imageId ? studioImageUrl(row.publicId) : null,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
  };
}
