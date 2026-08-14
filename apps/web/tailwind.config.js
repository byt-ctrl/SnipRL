/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        brand: {
          bg: '#090a0f',
          surface: '#11141d',
          card: '#161a26',
          border: '#242a3e',
          borderHover: '#3b4461',
          accent: '#00f0b5',
          accentHover: '#00d8a4',
          muted: '#8b949e',
        },
      },
    },
  },
  plugins: [],
};
