import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        hud: {
          bg: '#050810',
          panel: '#0a0f1e',
          cyan: '#00d4ff',
          purple: '#7b2fff',
          red: '#ff2d2d',
          amber: '#ffaa00',
          green: '#00ff88',
          text: '#e0f0ff',
          dim: '#4a6080',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'cyan-glow': '0 0 8px rgba(0, 212, 255, 0.4)',
        'red-glow': '0 0 8px rgba(255, 45, 45, 0.4)',
      },
    },
  },
  plugins: [],
} satisfies Config
