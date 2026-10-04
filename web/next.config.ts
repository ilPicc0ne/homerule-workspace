import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // next dev does not execute Vercel Python functions. Proxy only this endpoint
  // locally; deployed routing stays with Vercel and existing Next API routes.
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? [{ source: "/api/engine", destination: "http://127.0.0.1:5328/api/engine" }]
      : [];
  },
  // Pages and the address API read web/data/<source>/*.json at runtime when rendered on demand.
  outputFileTracingIncludes: {
    "/*": ["./data/**/*.json"],
  },
};

export default nextConfig;
