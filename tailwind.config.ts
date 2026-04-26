import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        flowcore: {
          bg: '#0F1419',
          surface: '#1A2332',
          'surface-hover': '#1F2937',
          accent: '#06B6D4',
          'accent-soft': 'rgba(6, 182, 212, 0.12)',
          success: '#10B981',
          warning: '#F59E0B',
          danger: '#EF4444',
          muted: '#6B7280',
          border: '#1F2937',
          'text-primary': '#F9FAFB',
          'text-secondary': '#9CA3AF',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        base: ['14px', '20px'],
      },
    },
  },
  plugins: [],
};

export default config;
