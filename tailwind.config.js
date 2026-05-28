/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          950: '#06060a',
          900: '#0d0d14',
          800: '#1a1a2e',
          700: '#2a2a40',
          600: '#3d3d5c',
          500: '#6b7280',
          400: '#9ca3af',
          300: '#d1d5db',
          neon: '#22d3ee',
          alert: '#f87171',
          emerald: '#34d399',
          violet: '#a78bfa',
          surface: '#111119',
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
