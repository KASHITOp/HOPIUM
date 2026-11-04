import type { Config } from "tailwindcss";

// Night-shift receipt counter. The only colours allowed on the site. Contrast results in REVIEW.md.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      counter: "#13120F", // page background
      slip: "#1E1C18", // receipts, panels
      rule: "#3A362E", // lines, borders, torn-edge outline
      ink: "#D6CEBD", // main text (lightest colour on the site)
      faded: "#8F897C", // secondary text
      red: "#D4614C", // stamp red, lightened from #D25A44 to pass 4.5:1 on slip
      green: "#6FA27E", // ledger green
      blue: "#7D9BCB", // links, focus
      pencil: "#6E695F", // SAT OUT / pending stamps (large/UI only, 3.1:1)
      pencilText: "#898377", // pencil hue lightened for small text (4.5:1)
    },
    fontFamily: {
      display: ['"Bricolage Grotesque"', "ui-sans-serif", "sans-serif"],
      mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
    },
    borderRadius: { none: "0", sm: "2px", DEFAULT: "2px" },
    extend: {
      letterSpacing: { tightest: "-0.045em" },
    },
  },
  plugins: [],
} satisfies Config;
