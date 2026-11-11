/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["var(--font-mono)", "Consolas", "Menlo", "monospace"],
      },
      colors: {
        // Neutrals
        ground: "#FFFFFF",
        wash: "#F3F4F5",
        sunk: "#E9EBED",
        rule: "#D9DCDF",
        "rule-strong": "#9BA1A8",
        ink: { DEFAULT: "#15171A", 2: "#2C3036" },
        sub: "#555B63",
        faint: "#6B717A",
        // The band, the highlighter, and "you are here"
        signal: { DEFAULT: "#FFD400", soft: "#FFF3B0", deep: "#F2C800" },
        // Line colours: one per file in a route, also data series and state
        line: {
          blue: "#0A5FD9",
          red: "#E2231A",
          green: "#007A41",
          orange: "#B84E00",
          violet: "#7A3DB8",
          teal: "#00788A",
          "blue-soft": "#E6EFFC",
          "red-soft": "#FDEBEA",
          "green-soft": "#E3F3EA",
          "orange-soft": "#FBEDE0",
          "violet-soft": "#F1E9F9",
          "teal-soft": "#E0F1F3",
        },
      },
      boxShadow: {
        // Only overlays float. Resting surfaces are flat.
        overlay: "0 18px 48px -12px rgba(21, 23, 26, 0.32), 0 2px 6px rgba(21, 23, 26, 0.12)",
      },
    },
  },
  plugins: [],
};
