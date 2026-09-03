import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  compiler: {
    styledComponents: true,
  },
  // Proxies relative /api/v1 fetches to the Express backend.
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.BACKEND_URL || "http://localhost:3000"}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
