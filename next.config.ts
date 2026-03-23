import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@vercel/blob', 'undici'],
};

export default nextConfig;
