import { Link } from 'react-router-dom';
import { ChevronRight, Gauge, Mic } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';

const TOOLS = [
  {
    to: 'metronome',
    icon: Gauge,
    title: 'Metronome',
    desc: 'Tempo with click sounds and visual light flashes — for solo or group time-keeping.',
  },
  {
    to: 'tuner',
    icon: Mic,
    title: 'Tuner',
    desc: 'Chromatic tuning, or targeted to the strings of a chosen instrument.',
  },
];

export function ToolsHome() {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Tools" subtitle="Practice utilities for playing and tuning." />
      <div className="space-y-3">
        {TOOLS.map(({ to, icon: Icon, title, desc }) => (
          <Link
            key={to}
            to={to}
            className="card flex items-center gap-4 p-4 transition hover:border-accent"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Icon size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{title}</span>
              <span className="block text-sm text-ink-500 dark:text-ink-400">{desc}</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-ink-400" />
          </Link>
        ))}
      </div>
    </div>
  );
}
