import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#050009',
        foreground: '#f5f3ff',
        primary: {
          DEFAULT: '#c026d3',
          foreground: '#fdf4ff'
        },
        accent: '#0f172a',
        border: '#312244'
      },
      boxShadow: {
        neon: '0 0 15px rgba(192,38,211,0.45)',
        panel: '0 15px 40px rgba(7,0,19,0.8)'
      },
      fontFamily: {
        techno: ['"Rajdhani"', 'sans-serif']
      }
    }
  },
  plugins: []
} satisfies Config;
