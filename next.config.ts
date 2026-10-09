import type { NextConfig } from 'next'

/**
 * Security headers on every response, in production only so `next dev` stays unaffected.
 * Vercel already redirects http → https; HSTS makes browsers skip the http hop entirely
 * from then on.
 */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  // No framing (clickjacking), no plugins, no <base> hijacking. Scripts and styles stay Next's defaults.
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
]

const nextConfig: NextConfig = {
  // The App Router already runs in strict mode.
  poweredByHeader: false,
  async headers() {
    return process.env.NODE_ENV === 'production' ? [{ source: '/:path*', headers: securityHeaders }] : []
  },
}

export default nextConfig
