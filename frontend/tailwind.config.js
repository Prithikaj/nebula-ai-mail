/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        nebula: {
          50:  '#f0f4ff',
          100: '#e0eaff',
          200: '#c7d7fe',
          300: '#a5bbfc',
          400: '#8196f8',
          500: '#6272f3',
          600: '#4f56e7',
          700: '#4044cb',
          800: '#3538a4',
          900: '#313482',
          950: '#1e1f4c',
        },
        surface: {
          DEFAULT: '#ffffff',
          dark:    '#0f1117',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,.08), 0 1px 2px -1px rgba(0,0,0,.06)',
        'card-hover': '0 4px 12px 0 rgba(0,0,0,.12)',
        panel: '0 8px 32px rgba(0,0,0,.12)',
      },
      animation: {
        'slide-in-right': 'slideInRight .25s ease-out',
        'fade-in':        'fadeIn .2s ease-out',
        'spin-slow':      'spin 2s linear infinite',
        'pulse-soft':     'pulseSoft 2s cubic-bezier(.4,0,.6,1) infinite',
      },
      keyframes: {
        slideInRight: {
          from: { transform: 'translateX(100%)', opacity: '0' },
          to:   { transform: 'translateX(0)',    opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%,100%': { opacity: '1' },
          '50%':     { opacity: '.6' },
        },
      },
    },
  },
  plugins: [],
}
