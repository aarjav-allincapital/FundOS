import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-jakarta)", "system-ui", "sans-serif"],
        mono: ["var(--font-jakarta)", "system-ui", "sans-serif"],
      },
      colors: {
        // Institutional neutral scale — near-black on white
        ink: {
          DEFAULT: "#0A0A0A",
          muted: "#525252",
          faint: "#8A8A8A",
        },
        line: {
          DEFAULT: "#E7E7E7",
          strong: "#D4D4D4",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          subtle: "#FAFAFA",
          sunken: "#F4F4F4",
        },
        // Brand — All In Capital red, used for report/reporting accents
        brand: {
          red: "#F0524B",
        },
        // Semantic — used sparingly, only for meaning
        gain: "#0F7B4D",
        loss: "#B42318",
        warn: "#B54708",
        pending: "#6941C6",
        info: "#175CD3",
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(10,10,10,0.04)",
        pop: "0 8px 24px -6px rgba(10,10,10,0.12)",
      },
      keyframes: {
        "live-ping": {
          "0%": { transform: "scale(1)", opacity: "0.55" },
          "75%, 100%": { transform: "scale(2.4)", opacity: "0" },
        },
        "live-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "live-ping": "live-ping 1.6s cubic-bezier(0, 0, 0.2, 1) infinite",
        "live-soft": "live-soft 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
