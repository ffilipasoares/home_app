/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#0B0B0C",
        surface: "#151517",
        raised: "#1E1E21",
        selected: "#323238",
        line: "#2A2A2E",
        ink: "#F4F4F5",
        muted: "#A1A1AA",
        subtle: "#71717A",
        accent: "#C8F169",
        "accent-hover": "#B6E24F",
        violet: "#A78BFA",
        coral: "#FF8A65",
        positive: "#C8F169",
        negative: "#FF7A7A",
        warning: "#FACC15",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        display: ['"Bricolage Grotesque"', "Inter", "ui-sans-serif", "sans-serif"],
      },
    },
  },
};
