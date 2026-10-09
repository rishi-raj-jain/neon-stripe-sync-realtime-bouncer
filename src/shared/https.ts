import * as v from 'valibot'

/**
 * https is enforced in production only (`next build`/`next start`, deployed functions), so
 * development accepts any URL and local setups keep working without certificates.
 */
const ENFORCE_HTTPS = process.env.NODE_ENV === 'production'

/** Hosts where plain http stays fine even in production builds: `next start` on your machine. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export function isSecureUrl(value: string, { allowLocalHttp = false } = {}): boolean {
  if (!ENFORCE_HTTPS) return true
  const url = new URL(value)
  return url.protocol === 'https:' || (allowLocalHttp && url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))
}

/**
 * Env schema for a URL that must be https in production. With `allowLocalHttp`,
 * http://localhost (and 127.0.0.1, [::1]) also passes there.
 */
export const httpsUrl = ({ allowLocalHttp = false } = {}) =>
  v.pipe(
    v.string(),
    v.url(),
    v.check((value) => isSecureUrl(value, { allowLocalHttp }), allowLocalHttp ? 'must be https:// (http:// only for localhost)' : 'must be https://'),
  )
