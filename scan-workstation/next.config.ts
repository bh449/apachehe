import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: "/scan",
  env: {
    NEXT_PUBLIC_BASE_PATH: "/scan",
  },
};

export default nextConfig;
