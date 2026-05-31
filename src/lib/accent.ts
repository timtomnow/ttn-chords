// Accent-color theming. A single accent token (see tailwind.config.js) is
// driven by CSS variables so changing it re-themes the whole app. We store the
// resolved RGB channels in localStorage too, so index.html can apply them
// synchronously before React mounts (no flash).

const RGB_KEY = 'ttn-chords:accent-rgb';
const FG_KEY = 'ttn-chords:accent-fg-rgb';

/** A small curated palette offered in Settings. Users can also pick custom. */
export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: 'Indigo', hex: '#4f46e5' },
  { name: 'Violet', hex: '#7c3aed' },
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Teal', hex: '#0d9488' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Amber', hex: '#d97706' },
  { name: 'Rose', hex: '#e11d48' },
  { name: 'Slate', hex: '#475569' },
];

export function hexToRgbTriple(hex: string): string {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return '79 70 229'; // fallback: indigo
  return `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}`;
}

/** Pick black or white foreground for contrast against the accent. */
function contrastTriple(hex: string): string {
  const [r, g, b] = hexToRgbTriple(hex).split(' ').map(Number);
  // Perceived luminance (sRGB-ish).
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '24 24 27' : '255 255 255'; // ink-900 or white
}

/** Apply an accent hex to the document and persist for the no-flash bootstrap. */
export function applyAccent(hex: string): void {
  const rgb = hexToRgbTriple(hex);
  const fg = contrastTriple(hex);
  const root = document.documentElement;
  root.style.setProperty('--accent-rgb', rgb);
  root.style.setProperty('--accent-fg-rgb', fg);
  try {
    localStorage.setItem(RGB_KEY, rgb);
    localStorage.setItem(FG_KEY, fg);
  } catch {
    /* ignore */
  }
}
