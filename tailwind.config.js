/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tactical: {
          bg: '#070b12',
          surface: '#0b1324',
          card: '#0f1b33',
          border: '#1e293b',
          cyan: '#06b6d4',
          cyanGlow: '#22d3ee',
          emerald: '#10b981',
          amber: '#f59e0b',
          orange: '#ea580c',
          red: '#ef4444',
          purple: '#a855f7',
          muted: '#64748b',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'cyan-glow': '0 0 15px rgba(6, 182, 212, 0.45)',
        'orange-glow': '0 0 15px rgba(234, 88, 12, 0.45)',
        'emerald-glow': '0 0 15px rgba(16, 185, 129, 0.45)',
        'amber-glow': '0 0 15px rgba(245, 158, 11, 0.45)',
        'red-glow': '0 0 20px rgba(239, 68, 68, 0.6)',
      },
      animation: {
        'pulse-fast': 'pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
};
