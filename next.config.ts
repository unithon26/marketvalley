import type { NextConfig } from "next";

const isVercelBuild = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  ...(isVercelBuild ? {} : { output: "standalone" as const }),
  reactStrictMode: true,
};

export default nextConfig;
