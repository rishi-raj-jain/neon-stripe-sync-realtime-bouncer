import type { ComponentProps } from 'react'

type IconProps = ComponentProps<'svg'> & { title?: string }

function Svg({ title, children, ...props }: IconProps & { viewBox: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} {...props}>
      {title && <title>{title}</title>}
      {children}
    </svg>
  )
}

/**
 * Tollbooth mark: a toll gate. A post with a striped barrier arm, and the token that lifts it.
 * One color (currentColor), so it themes with the UI.
 */
export function AppLogo(props: IconProps) {
  return (
    <Svg viewBox="0 0 32 32" {...props}>
      <path d="M5 8.5A2.5 2.5 0 0 1 7.5 6h1A2.5 2.5 0 0 1 11 8.5V26H5V8.5ZM3 26.5A1.5 1.5 0 0 1 4.5 25h7a1.5 1.5 0 0 1 1.5 1.5V29H3v-2.5Z" />
      <path d="M12.5 9.5h5v4h-5v-4Zm7 0h4v4h-4v-4Zm6 0h1.5a2 2 0 1 1 0 4h-1.5v-4Z" />
      <circle cx="22" cy="22.5" r="5" opacity="0.55" />
    </Svg>
  )
}

/** Path data for <NeonLoader mark={APP_LOADER_MARK} /> so the loader animates our mark. */
export const APP_LOADER_MARK = {
  path: 'M5 8.5A2.5 2.5 0 0 1 7.5 6h1A2.5 2.5 0 0 1 11 8.5V26H5V8.5ZM12.5 9.5h5v4h-5v-4Zm7 0h4v4h-4v-4Zm6 0h1.5a2 2 0 1 1 0 4h-1.5v-4Z',
  width: 32,
  height: 32,
}

/** Official Neon mark (same path as components/neon-loader). */
export function NeonLogo(props: IconProps) {
  return (
    <Svg viewBox="0 0 31.3 31.6" {...props}>
      <path d="M31.3,0v31.6l-12.2-10.6v10.6H0V0h31.3ZM3.8,27.7h11.4v-15.2l12.2,10.8V3.8H3.8s0,23.9,0,23.9Z" />
    </Svg>
  )
}

/** Stripe "S" mark (Simple Icons, CC0). Stripe purple by default. */
export function StripeLogo({ fill = '#635BFF', ...props }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" fill={fill} {...props}>
      <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z" />
    </Svg>
  )
}

/** GitHub mark (Simple Icons, CC0). */
export function GitHubIcon(props: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" {...props}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </Svg>
  )
}
