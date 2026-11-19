import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// The Go API. Server-side only, so it is never sent to the browser.
const apiURL = process.env.API_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    // Same origin for the browser, so the HttpOnly session cookie just works.
    return [{ source: "/api/:path*", destination: `${apiURL}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default createNextIntlPlugin()(nextConfig);
