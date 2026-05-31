// Image / logo block. Floating by default (logos sit in a corner). The photo
// lives in the `photos` table (Blob); config holds only its id, so it travels
// with ttn-backup and stays a live reference.

import { useRef } from 'react';
import { ImageIcon, Upload } from 'lucide-react';
import { createPhoto, deletePhoto, usePhotos } from '@/db/repo';
import { usePhotoUrl } from '@/components/report/usePhotoUrl';
import { registerBlock } from '../registry';
import type { BlockEditorProps, BlockRenderProps } from '../types';

function photoId(c: Record<string, unknown>): string | undefined {
  return typeof c.photoId === 'string' && c.photoId ? c.photoId : undefined;
}

function Render({ block, mode }: BlockRenderProps) {
  const id = photoId(block.config);
  const url = usePhotoUrl(id);
  const alt = typeof block.config.alt === 'string' ? block.config.alt : '';

  if (!url) {
    if (mode === 'print') return null;
    return (
      <div className="flex h-full min-h-[4rem] w-full items-center justify-center rounded-lg border border-dashed border-ink-300 text-xs text-ink-400 dark:border-ink-700">
        <ImageIcon size={18} className="mr-1" /> No image
      </div>
    );
  }
  return <img src={url} alt={alt} className="h-full w-full object-contain" draggable={false} />;
}

function Editor({ block, onChange }: BlockEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const photos = usePhotos();
  const selected = photoId(block.config);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const id = await createPhoto(file, file.type || 'image/png');
    onChange({ photoId: id });
    e.target.value = '';
  }

  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      <button className="btn-secondary w-full" onClick={() => fileRef.current?.click()}>
        <Upload size={15} /> Upload image
      </button>

      {photos && photos.length > 0 && (
        <div>
          <span className="label mb-1">Library</span>
          <div className="grid grid-cols-4 gap-2">
            {photos.map((p) => (
              <PhotoThumb
                key={p.id}
                id={p.id}
                active={p.id === selected}
                onPick={() => onChange({ photoId: p.id })}
                onDelete={() => {
                  if (p.id === selected) onChange({ photoId: '' });
                  void deletePhoto(p.id);
                }}
              />
            ))}
          </div>
        </div>
      )}

      <label className="block">
        <span className="label mb-1">Alt text</span>
        <input
          className="input"
          value={typeof block.config.alt === 'string' ? block.config.alt : ''}
          onChange={(e) => onChange({ alt: e.target.value })}
        />
      </label>
    </div>
  );
}

function PhotoThumb({
  id,
  active,
  onPick,
  onDelete,
}: {
  id: string;
  active: boolean;
  onPick: () => void;
  onDelete: () => void;
}) {
  const url = usePhotoUrl(id);
  return (
    <div className="group relative">
      <button
        onClick={onPick}
        className={`aspect-square w-full overflow-hidden rounded-lg border ${
          active ? 'border-accent ring-2 ring-accent/30' : 'border-ink-200 dark:border-ink-800'
        }`}
      >
        {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      </button>
      <button
        onClick={onDelete}
        className="absolute -right-1 -top-1 hidden rounded-full bg-red-600 px-1 text-[10px] text-white group-hover:block"
      >
        ✕
      </button>
    </div>
  );
}

registerBlock({
  type: 'image',
  label: 'Image / logo',
  icon: ImageIcon,
  defaultPlacement: { mode: 'floating', x: 5, y: 5, w: 30 },
  defaultConfig: () => ({ photoId: '', alt: '' }),
  Render,
  Editor,
});
