/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        unit: '#475569',
        struktural: '#1e40af',
        fungsional: '#047857',
        pelaksana: '#b45309',
      },
    },
  },
  plugins: [],
};
