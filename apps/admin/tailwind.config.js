/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Schibsted Grotesk"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'] },
      colors: {
        ink: '#101828',      // asphalt: text and the dispatch strip
        chalk: '#F3F5F7',    // page background
        line: '#E3E7EC',     // hairlines
        muted: '#667085',
        brand: '#2563EB',    // same blue as the rider and driver apps
        signal: '#D97706',   // reserved for things that need an admin's attention
        go: '#15803D',
        stop: '#B42318',
      },
    },
  },
  plugins: [],
};
