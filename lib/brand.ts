// Single source of truth for the visual identity, used by both the
// React pages (via CSS variables in globals.css) and the raw-HTML
// email templates (which can't read CSS variables, so they import
// these constants directly).

export const brand = {
  navy: "#0A1F44",
  navyDark: "#071630",
  white: "#FFFFFF",
  gray: "#6B7280",
  grayLight: "#E5E7EB",
  grayBg: "#F3F4F6",
  lime: "#B7F03A",
  limeDark: "#94CC1E",

  fontDisplay: "'Space Grotesk', 'Segoe UI', Arial, sans-serif",
  fontBody: "'Inter', 'Segoe UI', Arial, sans-serif",
};

export const event = {
  org: "Wits Developer Society",
  name: process.env.EVENT_NAME ?? "AI & Beyond Tech Conference 2026",
  dateLabel: process.env.EVENT_DATE_LABEL ?? "Saturday, 29 August 2026 · 11:00 – 15:00",
  venue: process.env.EVENT_VENUE ?? "Wits Main Campus, WSS4",
  spotsTotal: Number(process.env.EVENT_SPOTS_TOTAL ?? 105),
};
