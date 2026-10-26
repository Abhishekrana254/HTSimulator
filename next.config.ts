import type { NextConfig } from "next";

const pages = process.env.GITHUB_PAGES === "1";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  ...(pages
    ? {
        output: "export" as const,
        basePath: process.env.PAGES_BASE_PATH || "",
      }
    : {}),
};

export default nextConfig;
