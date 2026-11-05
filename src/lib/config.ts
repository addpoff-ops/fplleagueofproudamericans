// Sleeper's EPL player pool still includes players who have left the league
// (transferred abroad or relegated), and the API doesn't say which clubs are
// currently in the Premier League. Update this list each summer after
// promotion/relegation. Override with EPL_CLUBS="ARS,AVL,..." if you prefer.
const DEFAULT_CLUBS_2026_27 = [
  "ARS", "AVL", "BHA", "BOU", "BRE", "CHE", "COV", "CRY", "EVE", "FUL",
  "HUL", "IPS", "LEE", "LIV", "MCI", "MUN", "NEW", "NFO", "SUN", "TOT",
];

export const EPL_CLUBS = new Set(
  process.env.EPL_CLUBS ? process.env.EPL_CLUBS.split(",").map((s) => s.trim().toUpperCase()) : DEFAULT_CLUBS_2026_27,
);
