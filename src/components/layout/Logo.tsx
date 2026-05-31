import { Music4 } from 'lucide-react';

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
        <Music4 size={18} />
      </span>
      <span className="text-base font-semibold tracking-tight">TTN Chords</span>
    </div>
  );
}
