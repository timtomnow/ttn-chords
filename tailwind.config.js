/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        // Monospace family used for chord-over-lyric alignment.
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        // Neutral palette (shared light/dark).
        ink: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#27272a',
          900: '#18181b',
          950: '#09090b',
        },
        // User-selectable accent. Driven by CSS variables set at runtime from
        // settings (see src/lib/accent.ts), so a single token re-themes the
        // whole app. `<alpha-value>` keeps opacity utilities (accent/10) working.
        accent: {
          DEFAULT: 'rgb(var(--accent-rgb) / <alpha-value>)',
          fg: 'rgb(var(--accent-fg-rgb) / <alpha-value>)',
        },
      },
      boxShadow: {
        sheet: '0 -8px 24px -8px rgb(0 0 0 / 0.12)',
      },
    },
  },
  plugins: [],
};
