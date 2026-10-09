import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static build so the app can be served from GitHub Pages.
  output: "export",
  // Project pages live under /<repo>; the deploy workflow sets this. Empty locally.
  basePath: process.env.PAGES_BASE_PATH || "",
  images: { unoptimized: true },
};

export default nextConfig;
