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
        neon: {
          purple: '#9B5CFF',
          pink: '#FF3EB5',
          blue: '#4DE2FF',
          aqua: '#5CFFD0'
        },
        cyan: '#17d4ff',
        accent: '#0f172a',
        border: '#1f0a2e'
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: '0.8', transform: 'scale(0.99)' },
          '50%': { opacity: '1', transform: 'scale(1.02)' }
        },
        glitch: {
          '0%': { transform: 'translate(0)', filter: 'hue-rotate(0deg)' },
          '20%': { transform: 'translate(-1px, 1px) skewX(1deg)', filter: 'hue-rotate(10deg)' },
          '40%': { transform: 'translate(-2px, -1px) skewX(-1deg)', filter: 'hue-rotate(-10deg)' },
          '60%': { transform: 'translate(1px, 2px)', filter: 'hue-rotate(4deg)' },
          '80%': { transform: 'translate(-1px, -2px) skewX(1deg)', filter: 'hue-rotate(-6deg)' },
          '100%': { transform: 'translate(0)', filter: 'hue-rotate(0deg)' }
        }
      },
      animation: {
        pulse: 'pulse 1.6s ease-in-out infinite',
        glitch: 'glitch 2s infinite'
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
