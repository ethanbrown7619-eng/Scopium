import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Scopium palette
        navy: { DEFAULT: "#0B1220", 800: "#0F1828", 700: "#13203A" },
        cyan: { signal: "#3DD9D6" },
        amber: { alert: "#F5A623" },
        chrome: { 50: "#F5F7FB", 100: "#E6EAF2", 300: "#9AA3B2", 500: "#6B7488", 700: "#3A4255" },
      },
      fontFamily: {
        sans: ["Inter", "Space Grotesk", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
