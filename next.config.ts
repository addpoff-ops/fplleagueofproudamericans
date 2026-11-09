import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Never reuse a cached copy of a page when navigating within the site, so
  // saved changes (rankings, lineups) show up without a manual refresh.
  experimental: { staleTimes: { dynamic: 0, static: 30 } },
};

export default nextConfig;
