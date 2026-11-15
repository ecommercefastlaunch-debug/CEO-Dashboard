import type { NextConfig } from "next";

// Every page here shows live money, so nothing is cached or prerendered:
// `cacheComponents` is deliberately off.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
