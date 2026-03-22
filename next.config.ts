import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel のサーバーレス関数に data/ ディレクトリを含める
  outputFileTracingIncludes: {
    "/api/departures": ["./data/**/*"],
    "/api/alexa": ["./data/**/*"],
  },
};

export default nextConfig;
