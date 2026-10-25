/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#141923',
        primary: {
          DEFAULT: '#0066F5',
          hover: '#0055D4',
        },
        page: '#F8FAFC',
        ice: '#F4F8FE',
        border: '#E2E8F0',
        ink: '#111827',
        muted: '#64748B',
        success: '#059669',
        warning: '#D97706',
        danger: '#DC2626',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(16 24 40 / 0.05)',
        'card-hover': '0 4px 12px -2px rgb(16 24 40 / 0.10)',
      },
      borderRadius: {
        card: '0.625rem',
      },
    },
  },
  plugins: [],
}
