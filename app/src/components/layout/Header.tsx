import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.ts'

export default function Header() {
  const { isAuthenticated, isLoading, user, login, logout } = useAuth()

  return (
    <header className="bg-anchor-700 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
          <span className="text-2xl">⚓</span>
          <span className="text-xl font-bold tracking-tight">AnchorDeep</span>
        </Link>

        <nav className="flex items-center gap-6 text-sm font-medium">
          <Link to="/" className="hover:text-ocean-400 transition-colors">Search</Link>

          {isAuthenticated && (
            <Link to="/saved" className="hover:text-ocean-400 transition-colors">
              Saved
            </Link>
          )}
          {isAuthenticated && (
            <Link to="/alerts" className="hover:text-ocean-400 transition-colors">
              Alerts
            </Link>
          )}

          {!isLoading && (
            isAuthenticated ? (
              <div className="flex items-center gap-3">
                {user?.picture && (
                  <img src={user.picture} alt={user.name} className="w-7 h-7 rounded-full" />
                )}
                <button
                  onClick={logout}
                  className="text-white/70 hover:text-white transition-colors text-xs"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={login}
                className="bg-ocean-500 hover:bg-ocean-400 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
              >
                Sign in
              </button>
            )
          )}
        </nav>
      </div>
    </header>
  )
}
