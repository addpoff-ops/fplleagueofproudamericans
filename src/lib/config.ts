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

// Sleeper occasionally has a corrupted player record. These patch the fields we
// use, keyed by Sleeper player ID (confirmed against the draft results).
export const PLAYER_OVERRIDES: Record<string, { name: string; positions: string[]; team: string }> = {
  "1031": { name: "James Trafford", positions: ["GK"], team: "LEE" }, // Sleeper record holds Nottingham Forest club data
  "1047": { name: "Sander Berge", positions: ["M"], team: "FUL" }, // Sleeper record holds Everton club data
  "1226": { name: "Victor Lindelöf", positions: ["D"], team: "AVL" }, // Sleeper record holds Leeds club data
};
