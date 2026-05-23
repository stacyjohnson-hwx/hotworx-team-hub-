/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'brand-red':          '#FF0500',
        'brand-red-hover':    '#cc0400',
        'brand-orange':       '#F26922',
        'brand-orange-hover': '#DC531F',
        'brand-yellow':       '#FFBD00',
        'brand-charcoal':     '#333334',
        'brand-dark':         '#1A1A1A',
      },
    },
  },
  plugins: [],
}
