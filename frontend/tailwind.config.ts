import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
    "./src/app/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        prism: {
          bg: "rgb(var(--prism-bg) / <alpha-value>)",
          surface: "rgb(var(--prism-surface) / <alpha-value>)",
          border: "rgb(var(--prism-border) / <alpha-value>)",
          text: "rgb(var(--prism-text) / <alpha-value>)",
          accent: "rgb(var(--prism-accent) / <alpha-value>)",
          green: "rgb(var(--prism-green) / <alpha-value>)",
          red: "rgb(var(--prism-red) / <alpha-value>)",
          muted: "rgb(var(--prism-muted) / <alpha-value>)",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
