import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Carried over from the prototype so the visual identity survives the
        // rewrite: paper ground, deep teal ink, coral accent.
        paper: "#faf9f5",
        ink: { DEFAULT: "#08415C", soft: "#5A6B69" },
        sea: "#0B6E99",
        moss: "#1E8A5F",
        coral: "#FF6B4A",
        line: "#E6E3DB",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
