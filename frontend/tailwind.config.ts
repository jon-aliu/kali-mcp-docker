import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0d0d0d",
        surface: "#141414",
        sidebar: "#090909",
        "surface-hover": "#1e1e1e",
        "user-bubble": "#1e3a5f",
        accent: "#00ff88",
        "accent-dim": "#00cc6a",
        border: "#1f1f1f",
        "border-subtle": "#161616",
        text: "#e0e0e0",
        "text-muted": "#6b7280",
        "text-dim": "#3f3f46",
        error: "#ef4444",
        warning: "#f59e0b",
        success: "#10b981",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "Cascadia Code", "monospace"],
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out",
        "slide-in": "slide-in 0.2s ease-out",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in": {
          from: { transform: "translateX(-8px)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;

