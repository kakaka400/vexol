'use client';

import { cn } from '@/lib/utils';
import { useTwitter } from '../../context/TwitterContext';
import { useStudioImagesQuery } from '../../services/twitter.service';

const MAX_IMAGES = 4;

// Images come from the Studio image library; X takes up to four per post.
export default function TwitterMediaPicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  const { projectKey, canUseStudio } = useTwitter();
  const images = (useStudioImagesQuery(projectKey, canUseStudio).data ?? []).filter(
    (post) => post.imageUrl,
  );
  const toggle = (id: string) =>
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id].slice(0, MAX_IMAGES),
    );

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">
        Images ({value.length}/{MAX_IMAGES})
      </h3>
      {!canUseStudio ? (
        <p className="text-sm text-muted-foreground">
          Attaching images needs read access to Studio.
        </p>
      ) : images.length === 0 ? (
        <p className="text-sm text-muted-foreground">The Studio image library is empty.</p>
      ) : (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {images.map((image) => {
            const chosen = value.includes(image.id);
            return (
              <li key={image.id}>
                <button
                  type="button"
                  disabled={disabled || (!chosen && value.length >= MAX_IMAGES)}
                  onClick={() => toggle(image.id)}
                  aria-pressed={chosen}
                  aria-label={`Image: ${image.instruction.slice(0, 60)}`}
                  className={cn(
                    'block aspect-square w-full overflow-hidden rounded-md bg-muted ring-offset-2 transition disabled:opacity-50',
                    chosen && 'ring-2 ring-ring',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a public API image URL */}
                  <img src={image.imageUrl!} alt="" className="size-full object-cover" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
