import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf", "tesseract.js", "pg", "nodemailer"],
};

export default nextConfig;
