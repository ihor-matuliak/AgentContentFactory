import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @swarm/shared постачається як TypeScript-вихідники з монорепозиторію.
  transpilePackages: ["@swarm/shared"],
};

export default nextConfig;
