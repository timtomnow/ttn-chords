// Settings block: how chords sound in the Highway play-along, plus the library of
// per-chord recordings behind the "My recordings" source.
//
// A recording is filed under a normalized chord symbol (so "G" recorded once
// plays for every G in every song) and stored as a Blob in IndexedDB, the same
// way photos are. Recording uses MediaRecorder off the microphone; if the
// browser or the permission says no, the block degrades to the built-in tone and
// says so rather than breaking.

import { useEffect, useRef, useState } from 'react';
import { Mic, Play, Square, Trash2 } from 'lucide-react';
import { ChordSoundFields } from '@/components/tools/ChordSoundFields';
import {
  deleteChordSound,
  saveChordSound,
  saveSettings,
  useChordSounds,
  useSettings,
} from '@/db/repo';
import { DEFAULT_CHORD_SOUNDS, normalizeChordKey } from '@/lib/chordAudio';
import type { ChordSound } from '@/types';

export function ChordSoundSettings() {
  const settings = useSettings();
  const sounds = useChordSounds();
  const cfg = { ...DEFAULT_CHORD_SOUNDS, ...settings?.chordSounds };

  return (
    <section className="space-y-3">
      <h2 className="label">Chord sounds</h2>
      <ChordSoundFields
        value={cfg}
        onChange={(patch) => void saveSettings({ chordSounds: { ...cfg, ...patch } })}
        recordingCount={sounds?.length}
      />
      <RecordingLibrary sounds={sounds} />
    </section>
  );
}

function RecordingLibrary({ sounds }: { sounds: ChordSound[] | undefined }) {
  const [chord, setChord] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { recording, elapsedMs, start, stop } = useRecorder();

  const key = normalizeChordKey(chord);
  const existing = sounds?.find((s) => s.chord === key);

  async function toggleRecord() {
    setError(null);
    if (recording) {
      const take = await stop();
      if (!take) return;
      try {
        await saveChordSound(key, take.blob, take.mime, take.durationMs);
        setChord('');
      } catch (err) {
        setError(`Couldn't save that recording: ${String(err)}`);
      }
      return;
    }
    if (!key) {
      setError('Name the chord first — that’s how the recording gets matched.');
      return;
    }
    try {
      await start();
    } catch {
      setError('No microphone access. Allow it in your browser, then try again.');
    }
  }

  return (
    <div className="card divide-y divide-ink-200 dark:divide-ink-800">
      <div className="space-y-3 px-4 py-3">
        <span className="label">Record a chord</span>
        <p className="text-xs text-ink-500 dark:text-ink-400">
          Play the chord once on your instrument. Recording it again replaces the old
          take. Use <code className="font-mono">N.C.</code> for a stop if you want a sound
          on the break too.
        </p>
        <div className="flex items-center gap-2">
          <input
            className="input h-10 w-32"
            placeholder="G, Am7…"
            value={chord}
            onChange={(e) => setChord(e.target.value)}
            disabled={recording}
            aria-label="Chord to record"
          />
          <button
            className={recording ? 'btn-primary' : 'btn-secondary'}
            onClick={() => void toggleRecord()}
          >
            {recording ? <Square size={16} /> : <Mic size={16} />}
            {recording ? `Stop · ${(elapsedMs / 1000).toFixed(1)}s` : 'Record'}
          </button>
        </div>
        {existing && !recording && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {key} already has a recording — this will replace it.
          </p>
        )}
        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </div>

      {sounds === undefined ? (
        <p className="px-4 py-3 text-sm text-ink-500">Loading…</p>
      ) : sounds.length === 0 ? (
        <p className="px-4 py-3 text-sm text-ink-500 dark:text-ink-400">
          No recordings yet. Every chord uses the built-in tone until you record one.
        </p>
      ) : (
        sounds.map((s) => <SoundRow key={s.id} sound={s} />)
      )}
    </div>
  );
}

function SoundRow({ sound }: { sound: ChordSound }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(sound.blob);
    const el = new Audio(url);
    audioRef.current = el;
    return () => {
      el.pause();
      URL.revokeObjectURL(url);
      audioRef.current = null;
    };
  }, [sound.blob]);

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{sound.chord}</span>
        <span className="block text-xs text-ink-500 dark:text-ink-400">
          {(sound.durationMs / 1000).toFixed(1)}s
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <button
          className="btn-ghost p-2"
          onClick={() => {
            const el = audioRef.current;
            if (!el) return;
            el.currentTime = 0;
            void el.play();
          }}
          aria-label={`Play the ${sound.chord} recording`}
        >
          <Play size={16} />
        </button>
        <button
          className="btn-ghost p-2 text-rose-600 dark:text-rose-400"
          onClick={() => void deleteChordSound(sound.id)}
          aria-label={`Delete the ${sound.chord} recording`}
        >
          <Trash2 size={16} />
        </button>
      </span>
    </div>
  );
}

/** Microphone → Blob, with a running length so the button can show it. */
function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 100);
    return () => clearInterval(id);
  }, [recording]);

  // Never leave the microphone open behind the page.
  useEffect(
    () => () => {
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') rec.stop();
      rec?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    recorderRef.current = rec;
    chunksRef.current = [];
    // Wired before start(), not in stop(): a browser that emits chunks as it goes
    // must not drop the ones that arrive before the user hits stop.
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    rec.start();
    setRecording(true);
  }

  function stop(): Promise<{ blob: Blob; mime: string; durationMs: number } | null> {
    const rec = recorderRef.current;
    if (!rec) return Promise.resolve(null);
    return new Promise((resolve) => {
      rec.onstop = () => {
        rec.stream.getTracks().forEach((t) => t.stop());
        recorderRef.current = null;
        setRecording(false);
        const mime = rec.mimeType || 'audio/webm';
        resolve({
          blob: new Blob(chunksRef.current, { type: mime }),
          mime,
          durationMs: Date.now() - startedAtRef.current,
        });
      };
      rec.stop();
    });
  }

  return { recording, elapsedMs, start, stop };
}
