import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { addTag, normalizeTag, removeTag } from '@/lib/tags';

export function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');

  function commit() {
    const next = addTag(tags, draft);
    if (next !== tags) onChange(next);
    setDraft('');
  }

  return (
    <div className="input flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span key={tag} className="chip chip-active gap-1">
          {tag}
          <button onClick={() => onChange(removeTag(tags, tag))} className="-mr-1">
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        className="min-w-[6rem] flex-1 bg-transparent text-sm outline-none"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !draft && tags.length) {
            onChange(removeTag(tags, normalizeTag(tags[tags.length - 1])));
          }
        }}
        placeholder={placeholder}
      />
    </div>
  );
}
