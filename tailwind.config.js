/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Anchored to the shelf logo disc color (public/icon.svg, #5B4CFF).
        brand: {
          200: '#cec9ff',
          400: '#8c82ff',
          500: '#6f61ff',
          600: '#5b4cff',
        },
      },
    },
  },
  plugins: [],
}
