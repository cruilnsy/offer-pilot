import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // data/ holds the user's resume, profile and database: never ship it with a build
  outputFileTracingExcludes: { "*": ["./data/**/*"] },
  // The home page is now the Sources page; redirect the old URL
  async redirects() {
    return [
      { source: "/sources", destination: "/", permanent: true },
      // Board pages used to be fixed routes
      { source: "/frontend", destination: "/boards/frontend", permanent: false },
      { source: "/ai", destination: "/boards/ai", permanent: false },
    ];
  },
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
