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
          bg: '#0a0a0c',
          card: '#121216',
          neon: '#00f2ff',
          alert: '#ff003c',
          dim: '#1e1e24'
        }
      }
    },
  },
  plugins: [],
}
