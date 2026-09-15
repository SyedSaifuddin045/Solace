import type { NextConfig } from "next";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
let backendOrigin = "http://localhost:8000";
try {
  backendOrigin = new URL(BACKEND_URL).origin;
} catch {
  // fall back to dev default on malformed env
}
const backendWs = backendOrigin.replace(/^http/, "ws");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
      { key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https: ${backendOrigin}; connect-src 'self' http://localhost:* https://*.googlevideo.com ${backendOrigin} ${backendWs}; frame-ancestors 'none'` },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;