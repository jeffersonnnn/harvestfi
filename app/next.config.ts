import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app (a stray lockfile exists higher up the tree).
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
