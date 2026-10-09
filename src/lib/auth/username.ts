import 'server-only'

/**
 * Neon Auth's email/password method needs an email, and the Better Auth username plugin
 * isn't one Neon offers. So a username maps to a placeholder address on a reserved,
 * non-routable TLD. Nothing is ever sent to it (email verification is off on the branch).
 */
const USERNAME_DOMAIN = 'users.tollbooth.invalid'

export const usernameToEmail = (username: string) => `${username.toLowerCase()}@${USERNAME_DOMAIN}`

/** Placeholder addresses must never reach Stripe (receipts) or any mailer. */
export const isPlaceholderEmail = (email: string) => email.toLowerCase().endsWith(`@${USERNAME_DOMAIN}`)

/** The username a placeholder address stands for (lowercased), or null for a real email. */
export const emailToUsername = (email: string) => (isPlaceholderEmail(email) ? email.slice(0, email.indexOf('@')).toLowerCase() : null)
