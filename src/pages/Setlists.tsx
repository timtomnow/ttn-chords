import { ListMusic } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSetlists } from '@/db/repo';

// Scaffold placeholder. The setlist builder + reorder + per-performance
// overrides land in Phase 6 (see plan.md).
export function Setlists() {
  const setlists = useSetlists();

  return (
    <div>
      <PageHeader title="Setlists" subtitle="Ordered selections of songs for a session" />
      {setlists && setlists.length > 0 ? (
        <ul className="space-y-2">
          {setlists.map((s) => (
            <li key={s.id} className="card px-4 py-3 font-medium">
              {s.name}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={ListMusic}
          title="No setlists yet"
          description="Setlists let you pick and order songs for a class or session. Building this is Phase 6."
        />
      )}
    </div>
  );
}
