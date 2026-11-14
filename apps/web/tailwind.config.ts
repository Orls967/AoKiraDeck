import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#0B0F14',
        surface: '#141B23',
        elevated: '#1C2631',
        borderSubtle: '#243242',
        borderCard: '#233040',
        cyan: {
          aokira: '#36C5D9',
        },
        blue: {
          telemetry: '#3B82F6',
        },
        status: {
          green: '#22C55E',
          amber: '#F59E0B',
          red: '#EF4444',
        },
        textPrimary: '#F1F5F9',
        textSecondary: '#94A3B8',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
