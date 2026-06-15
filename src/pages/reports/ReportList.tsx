import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Music, ListMusic, Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import {
  createReportTemplate,
  useAdminMode,
  useReportTemplates,
  useSetlists,
  useSongs,
} from '@/db/repo';
import { newId } from '@/lib/id';
import type { ReportPage } from '@/types';

// A song block filling one page, used when seeding a report from a song/setlist.
function songPage(songId: string): ReportPage {
  return {
    id: newId(),
    blocks: [
      {
        id: newId(),
        type: 'song',
        placement: { mode: 'flow' },
        config: {
          songId,
          transpose: 0,
          showTitle: true,
          showCharts: true,
          showRhythm: true,
          showChords: true,
          sectionIds: null,
        },
      },
    ],
  };
}

export function ReportList() {
  const templates = useReportTemplates();
  const songs = useSongs();
  const setlists = useSetlists();
  const navigate = useNavigate();
  const admin = useAdminMode();
  const [seedOpen, setSeedOpen] = useState<null | 'song' | 'setlist'>(null);

  async function newBlank() {
    const id = await createReportTemplate({ name: 'New report' });
    navigate(id);
  }

  async function fromSong(songId: string, title: string) {
    const id = await createReportTemplate({ name: title, pages: [songPage(songId)] });
    navigate(id);
  }

  async function fromSetlist(setlistId: string) {
    const setlist = setlists?.find((s) => s.id === setlistId);
    if (!setlist) return;
    const pages = setlist.entries.map((e) => songPage(e.songId));
    const id = await createReportTemplate({
      name: setlist.name,
      pages: pages.length ? pages : undefined,
      chrome: {
        footer: { left: '{title}', right: 'Page {page} of {pages}' },
      },
    });
    navigate(id);
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Printable songbooks & handouts"
        actions={
          admin ? (
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => setSeedOpen('song')}>
                <Music size={15} /> From song
              </button>
              <button className="btn-secondary" onClick={() => setSeedOpen('setlist')}>
                <ListMusic size={15} /> From setlist
              </button>
              <button className="btn-primary" onClick={newBlank}>
                <Plus size={16} /> New
              </button>
            </div>
          ) : undefined
        }
      />

      {templates === undefined ? null : templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No reports yet"
          description="Lay out songs, chord charts, logos, and rhythms across pages, then print to PDF."
          action={
            admin ? (
              <button className="btn-primary" onClick={newBlank}>
                <Plus size={16} /> New report
              </button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => navigate(t.id)}
                className="card flex w-full items-center justify-between px-4 py-3 text-left transition hover:border-accent"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.name}</div>
                  <div className="text-sm text-ink-500 dark:text-ink-400">
                    {t.pages.length} {t.pages.length === 1 ? 'page' : 'pages'} ·{' '}
                    {t.pageSize.toUpperCase()} {t.orientation}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={seedOpen === 'song'}
        onClose={() => setSeedOpen(null)}
        title="New report from a song"
      >
        <SeedList
          items={songs?.map((s) => ({ id: s.id, label: s.title })) ?? []}
          empty="No songs yet."
          onPick={(id, label) => {
            setSeedOpen(null);
            void fromSong(id, label);
          }}
        />
      </Modal>

      <Modal
        open={seedOpen === 'setlist'}
        onClose={() => setSeedOpen(null)}
        title="New report from a setlist"
      >
        <SeedList
          items={
            setlists?.map((s) => ({
              id: s.id,
              label: `${s.name} · ${s.entries.length} songs`,
            })) ?? []
          }
          empty="No setlists yet."
          onPick={(id) => {
            setSeedOpen(null);
            void fromSetlist(id);
          }}
        />
      </Modal>
    </div>
  );
}

function SeedList({
  items,
  empty,
  onPick,
}: {
  items: { id: string; label: string }[];
  empty: string;
  onPick: (id: string, label: string) => void;
}) {
  if (items.length === 0) return <p className="text-sm text-ink-500">{empty}</p>;
  return (
    <ul className="max-h-80 space-y-1 overflow-y-auto">
      {items.map((it) => (
        <li key={it.id}>
          <button
            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-ink-100 dark:hover:bg-ink-800"
            onClick={() => onPick(it.id, it.label)}
          >
            {it.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
