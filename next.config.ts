import type { NextConfig } from "next";

// Keep in sync with src/lib/images.ts (isOptimizableImage).
const nextConfig: NextConfig = {
  // Lets phones/tablets on the same network open the dev server by IP (e.g. http://192.168.3.99:3000).
  allowedDevOrigins: ["192.168.3.99", "192.168.*.*", "10.*.*.*"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      // Supabase Storage (uploaded profile photos)
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      // Google account photos (social sign-in)
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
