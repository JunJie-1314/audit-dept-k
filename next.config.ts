import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const withMDX = createMDX();

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "mdx"],
  async redirects() {
    return [
      {
        // The workbench uses relative asset and data paths.
        source: "/dashboard/workbench",
        destination: "/dashboard/workbench/index.html",
        permanent: false,
      },
    ];
  },
};

export default withMDX(nextConfig);
