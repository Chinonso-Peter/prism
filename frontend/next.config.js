const isDev = process.env.NODE_ENV !== "production";

/** Origins of the configured Horizon and RPC endpoints, skipping any value that isn't a URL. */
function endpointOrigins() {
  return [process.env.NEXT_PUBLIC_HORIZON_URL, process.env.NEXT_PUBLIC_SOROBAN_RPC_URL]
    .filter(Boolean)
    .flatMap((url) => {
      try {
        return [new URL(url).origin];
      } catch {
        return [];
      }
    });
}

// Next.js injects inline scripts and styles, so 'unsafe-inline' stays until the
// app moves to nonces. 'unsafe-eval' is only needed by the dev server.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${endpointOrigins().join(" ")}`.trimEnd(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
