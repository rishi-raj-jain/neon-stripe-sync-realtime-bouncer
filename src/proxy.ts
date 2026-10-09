import { auth } from '@/lib/auth/server'

// Next.js 16: proxy.ts replaces middleware.ts.
export default auth.middleware({ loginUrl: '/auth' })

export const config = {
  matcher: ['/dashboard/:path*'],
}
