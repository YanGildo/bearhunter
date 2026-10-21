import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        bg: 'hsl(var(--bg))',
        panel: 'hsl(var(--panel))',
        card: 'hsl(var(--card))',
        raised: 'hsl(var(--raised))',
        line: 'hsl(var(--line))',
        fg: 'hsl(var(--fg))',
        muted: 'hsl(var(--muted))',
        dim: 'hsl(var(--dim))',
        primary: 'hsl(var(--primary))',
        up: 'hsl(var(--up))',
        down: 'hsl(var(--down))',
        initial: 'hsl(var(--initial))',
        strong: 'hsl(var(--strong))',
        explosive: 'hsl(var(--explosive))',
        revival: 'hsl(var(--revival))',
        custom: 'hsl(var(--custom))',
        cyan: 'hsl(var(--ind-cyan))',
        pink: 'hsl(var(--ind-pink))',
        lime: 'hsl(var(--ind-lime))',
        warn: 'hsl(var(--warn))',
      },
    },
  },
  plugins: [],
} satisfies Config;
