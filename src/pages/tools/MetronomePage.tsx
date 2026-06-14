import { PageHeader } from '@/components/ui/PageHeader';
import { MetronomePanel } from '@/components/tools/MetronomePanel';
import { saveSettings, useSettings } from '@/db/repo';
import { DEFAULT_METRONOME } from '@/lib/metronome';
import type { MetronomeSettings } from '@/types';

export function MetronomePage() {
  const settings = useSettings();
  if (!settings) return <p className="text-sm text-ink-500">Loading…</p>;

  const value: MetronomeSettings = { ...DEFAULT_METRONOME, ...settings.metronome };
  const onChange = (patch: Partial<MetronomeSettings>) =>
    void saveSettings({ metronome: { ...value, ...patch } });

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Metronome" subtitle="Keep time with sound, light, or both." />
      <MetronomePanel value={value} onChange={onChange} />
    </div>
  );
}
