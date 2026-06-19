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
        'romantic-enter': {
          '0%': { opacity: '0', transform: 'scale(0.92) translateY(12px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' }
        },
        'romantic-exit': {
          '0%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.94) translateY(-6px)' }
        },
        'romantic-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(244, 114, 182, 0.45)' },
          '50%': { boxShadow: '0 0 24px 4px rgba(244, 114, 182, 0.35)' }
        },
        'organization-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(168, 85, 247, 0.45)' },
          '50%': { boxShadow: '0 0 28px 6px rgba(168, 85, 247, 0.35)' }
        },
        'heart-float': {
          '0%': { opacity: '0', transform: 'translateY(0) scale(0.6)' },
          '15%': { opacity: '1', transform: 'translateY(-8px) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-56px) scale(0.85)' }
        },
        'celebration-enter': {
          '0%': { opacity: '0', transform: 'scale(0.88) translateY(14px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' }
        },
        'skill-spark-rise': {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.5) rotate(-20deg)' },
          '20%': { opacity: '1', transform: 'translateY(-4px) scale(1.1) rotate(8deg)' },
          '100%': { opacity: '0', transform: 'translateY(-72px) scale(0.7) rotate(24deg)' }
        },
        'skill-ring-pulse': {
          '0%': { opacity: '0.7', transform: 'scale(0.75)' },
          '100%': { opacity: '0', transform: 'scale(1.35)' }
        },
        'skill-orbit': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' }
        },
        'xp-pop': {
          '0%': { opacity: '0', transform: 'scale(0.6) translateY(6px)' },
          '40%': { opacity: '1', transform: 'scale(1.15) translateY(0)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(-2px)' }
        },
        'character-rise': {
          '0%': { opacity: '0', transform: 'translateY(0) scale(0.7)' },
          '20%': { opacity: '1', transform: 'translateY(-10px) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-52px) scale(0.9)' }
        },
        'location-ripple': {
          '0%': { opacity: '0.6', transform: 'translate(-50%, -50%) scale(0.4)' },
          '100%': { opacity: '0', transform: 'translate(-50%, -50%) scale(1.6)' }
        },
        'location-pin-drop': {
          '0%': { opacity: '0', transform: 'translate(-50%, -24px) scale(0.6)' },
          '55%': { opacity: '1', transform: 'translate(-50%, 2px) scale(1.05)' },
          '75%': { transform: 'translate(-50%, -2px) scale(1)' },
          '100%': { opacity: '1', transform: 'translate(-50%, 0) scale(1)' }
        },
        'quest-star-burst': {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.4) rotate(0deg)' },
          '30%': { opacity: '1', transform: 'translateY(-6px) scale(1.2) rotate(20deg)' },
          '100%': { opacity: '0', transform: 'translateY(-48px) scale(0.6) rotate(45deg)' }
        },
        'chat-focus-enter': {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' }
        },
        'stat-bump': {
          '0%': { transform: 'scale(1)' },
          '35%': { transform: 'scale(1.12)' },
          '100%': { transform: 'scale(1)' }
        },
        'focus-composer-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(244, 114, 182, 0.35)' },
          '50%': { boxShadow: '0 0 0 4px rgba(244, 114, 182, 0.2), 0 0 28px rgba(244, 114, 182, 0.25)' }
        },
        'focus-shimmer': {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' }
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
        glitch: 'glitch 2s infinite',
        'romantic-enter': 'romantic-enter 0.55s cubic-bezier(0.22, 1, 0.36, 1) both',
        'romantic-exit': 'romantic-exit 0.38s ease-in forwards',
        'romantic-glow': 'romantic-glow 1.8s ease-in-out 3',
        'organization-glow': 'organization-glow 1.8s ease-in-out 3',
        'heart-float': 'heart-float 1.1s ease-out forwards',
        'celebration-enter': 'celebration-enter 0.55s cubic-bezier(0.22, 1, 0.36, 1) both',
        'skill-spark-rise': 'skill-spark-rise 1.25s ease-out forwards',
        'skill-ring-pulse': 'skill-ring-pulse 1.1s ease-out forwards',
        'skill-orbit': 'skill-orbit 1.4s linear infinite',
        'xp-pop': 'xp-pop 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.35s both',
        'character-rise': 'character-rise 1.05s ease-out forwards',
        'location-ripple': 'location-ripple 1.2s ease-out forwards',
        'location-pin-drop': 'location-pin-drop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'quest-star-burst': 'quest-star-burst 1.1s ease-out forwards',
        'chat-focus-enter': 'chat-focus-enter 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'stat-bump': 'stat-bump 0.45s ease-out',
        'focus-composer-pulse': 'focus-composer-pulse 2.4s ease-in-out 1',
        'focus-shimmer': 'focus-shimmer 2.2s linear infinite'
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
