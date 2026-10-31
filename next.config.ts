import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pg", "mongodb", "bcryptjs"],
};

export default nextConfig;
