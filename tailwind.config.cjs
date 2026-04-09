/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './client/**/*.{js,jsx,ts,tsx,html}',
    './client/index.html',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#c41e3a',
          dark: '#8b0000',
          light: '#e85d75',
        },
        secondary: '#2c3e50',
        accent: {
          blue: '#3498db',
          green: '#27ae60',
          orange: '#f39c12',
          red: '#e74c3c',
        },
        surface: '#f8f9fa',
        border: '#dee2e6',
      },
    },
  },
  plugins: [],
};
