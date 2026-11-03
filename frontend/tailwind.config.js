/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "Plus Jakarta Sans",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono)",
          "JetBrains Mono",
          "Fira Code",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: {
          50: "#1e293b",
          100: "#161f30",
          200: "#111827",
          300: "#0f1623",
          400: "#0b0f17",
        },
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554",
        },
      },
      boxShadow: {
        panel: "0 2px 8px rgba(0, 0, 0, 0.28)",
        modal: "0 16px 48px rgba(0, 0, 0, 0.6)",
      },
    },
  },
  plugins: [],
};
