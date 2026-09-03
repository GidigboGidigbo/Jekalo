'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from './AuthProvider'

// Pages that don't require authentication
const PUBLIC_PAGES = ['/', '/login', '/signup']

/**
 * ProtectedRoutes wrapper component
 * Redirects unauthenticated users to login page (except for public pages)
 */
export function ProtectedRoutes({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, isLoading } = useAuth()

  useEffect(() => {
    // Skip redirect if still loading
    console.log("isAuthenticated: ", isAuthenticated)
    if (isLoading) return

    // Allow public pages
    if (PUBLIC_PAGES.includes(pathname)) return

    // Redirect to login if not authenticated
    if (!isAuthenticated) {
      router.push('/login')
    }
  }, [isLoading, isAuthenticated, pathname, router])

  // Show nothing while loading auth state to prevent flash of content
  if (isLoading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>
  }

  // Allow public pages regardless of auth state
  if (PUBLIC_PAGES.includes(pathname)) {
    return children
  }

  // Show content only if authenticated
  if (!isAuthenticated) {
    return null
  }

  return children
}
