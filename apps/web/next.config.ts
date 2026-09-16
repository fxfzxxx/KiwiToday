import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source rather than a build step.
  transpilePackages: ["@kiwi/core", "@kiwi/db"],
  images: {
    // Cover images are hotlinked from sources for now. Before launch these
    // should be pulled through R2 (zero egress) rather than leaning on
    // someone else's bandwidth.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  typedRoutes: true,
};

export default config;
