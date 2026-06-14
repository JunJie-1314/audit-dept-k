import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const withMDX = createMDX();

const nextConfig: NextConfig = {
  output: "export",
  pageExtensions: ["ts", "tsx", "mdx"],
  images: {
    unoptimized: true, // required for static export
  },
};

export default withMDX(nextConfig);
