import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0d0d0f',
        foreground: '#f6f3ff',
        primary: {
          DEFAULT: '#9a4dff',
          foreground: '#0d0d0f'
        },
        secondary: {
          DEFAULT: '#ff1fae',
          foreground: '#0d0d0f'
        },
        cyan: '#17d4ff',
        accent: '#0f172a',
        border: '#1f0a2e'
      },
      boxShadow: {
        neon: '0 0 20px rgba(154,77,255,0.45)',
        panel: '0 15px 50px rgba(0,0,0,0.75)'
      },
      fontFamily: {
        techno: ['"Rajdhani"', 'sans-serif']
      },
      backgroundImage: {
        'neon-grid':
          'radial-gradient(circle at 20% 20%, rgba(154,77,255,0.16), transparent 30%), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(180deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
        'neon-gradient': 'linear-gradient(135deg, rgba(154,77,255,0.35), rgba(23,212,255,0.28))'
      }
    }
  },
  plugins: []
} satisfies Config;
