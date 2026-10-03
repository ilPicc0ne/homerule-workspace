import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages and the address API read web/data/<source>/*.json at runtime when rendered on demand.
  outputFileTracingIncludes: {
    "/*": ["./data/**/*.json"],
  },
};

export default nextConfig;
