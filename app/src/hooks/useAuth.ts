import { useEffect } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { setTokenProvider } from '../lib/api-client.ts'

const AUTH0_CONFIGURED =
  !!(import.meta.env.VITE_AUTH0_DOMAIN) &&
  !String(import.meta.env.VITE_AUTH0_DOMAIN ?? '').startsWith('your-tenant')

export interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  user: { name?: string; email?: string; picture?: string } | null
  login: () => void
  logout: () => void
}

function useDevAuth(): AuthState {
  return {
    isAuthenticated: true,
    isLoading: false,
    user: { name: 'Dev User', email: 'dev@anchordeep.local' },
    login: () => {},
    logout: () => {},
  }
}

function useAuth0Auth(): AuthState {
  const { isAuthenticated, isLoading, user, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0()

  useEffect(() => {
    if (isAuthenticated) {
      setTokenProvider(() => getAccessTokenSilently())
    }
  }, [isAuthenticated, getAccessTokenSilently])

  return {
    isAuthenticated,
    isLoading,
    user: user ? { name: user.name, email: user.email, picture: user.picture } : null,
    login: () => loginWithRedirect(),
    logout: () => logout({ logoutParams: { returnTo: window.location.origin } }),
  }
}

// Export one implementation — the check is at module level, not inside a hook
export const useAuth: () => AuthState = AUTH0_CONFIGURED ? useAuth0Auth : useDevAuth
