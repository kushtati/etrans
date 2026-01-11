/**
 * TAILWIND CSS V4 CONFIGURATION
 * 
 * Tailwind v4 a une config simplifiée et utilise @import dans le CSS
 * La purge est automatique via le contenu scanné
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./App.tsx",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
