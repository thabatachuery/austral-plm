/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        'xxs': '10px',
      },
      colors: {
        apple: {
          blue: '#007AFF',
          green: '#34C759',
          orange: '#FF9F0A',
          red: '#FF3B30',
        },
      },
    },
  },
  plugins: [],
};
