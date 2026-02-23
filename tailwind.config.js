/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        kubernetes: {
          50: '#f0f9ff',
          500: '#326ce5',
          600: '#1d4ed8',
          700: '#1e40af',
        }
      }
    },
  },
  plugins: [],
  darkMode: 'class',
}