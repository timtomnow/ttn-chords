import { useNavigate } from 'react-router-dom';
import { ListMusic, Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { createSetlist, useAdminMode, useSetlists } from '@/db/repo';

export function SetlistList() {
  const setlists = useSetlists();
  const navigate = useNavigate();
  const admin = useAdminMode();

  async function quickAdd() {
    const id = await createSetlist({ name: 'New setlist' });
    navigate(id);
  }

  return (
    <div>
      <PageHeader
        title="Setlists"
        subtitle="Ordered selections of songs for a class or session"
        actions={
          admin ? (
            <button className="btn-primary" onClick={quickAdd}>
              <Plus size={16} /> New
            </button>
          ) : undefined
        }
      />

      {setlists === undefined ? null : setlists.length === 0 ? (
        <EmptyState
          icon={ListMusic}
          title="No setlists yet"
          description="Group songs into an ordered list you can run through in performance mode."
          action={
            admin ? (
              <button className="btn-primary" onClick={quickAdd}>
                <Plus size={16} /> New setlist
              </button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2">
          {setlists.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => navigate(s.id)}
                className="card flex w-full items-center justify-between px-4 py-3 text-left transition hover:border-accent"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.name}</div>
                  <div className="text-sm text-ink-500 dark:text-ink-400">
                    {s.entries.length} {s.entries.length === 1 ? 'song' : 'songs'}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
