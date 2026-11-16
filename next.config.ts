import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["pdfkit", "exceljs"],
  outputFileTracingIncludes: {
    "/api/loans/[id]/statement": ["./assets/fonts/**/*"],
    "/api/payments/[id]/receipt": ["./assets/fonts/**/*"],
  },
};

export default nextConfig;
