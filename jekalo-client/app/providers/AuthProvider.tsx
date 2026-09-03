'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type User = {
  id: string
  firstName: string
  lastName: string
  email: string
  phoneNumber: string
  profilePicture?: string
  nin?: string
  bvn?: string
  ninVerified?: boolean
  bvnVerified?: boolean
  isVerifiedDriver?: boolean
  createdAt: string
}

type AuthContextType = {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (identifier: string, password: string) => Promise<{ user: User; token: string }>
  logout: () => void
  checkAuth: () => Promise<void>
  setToken: React.Dispatch<React.SetStateAction<string | null>>
  setUser: React.Dispatch<React.SetStateAction<User | null>>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Mock user data for development
export const MOCK_USER: User = {
  id: 'user_123',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  phoneNumber: '+234801234567',
  profilePicture: undefined,
  nin: '12345678901',
  bvn: undefined,
  ninVerified: true,
  bvnVerified: false,
  isVerifiedDriver: false,
  createdAt: new Date().toISOString(),
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Initialize auth state from localStorage and verify token
  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedToken = localStorage.getItem('accessToken')
        if (storedToken) {
          setToken(storedToken)
          
          // Check if this is a mock token (for development)
          if (storedToken.startsWith('mock_token_')) {
            // Use mock user data for mock tokens
            setUser(MOCK_USER)
          } else {
            // Verify token by fetching user profile
            const response = await fetch('/api/v1/users/profile/me', {
              headers: {
                Authorization: `Bearer ${storedToken}`,
              },
            })
            if (response.ok) {
              const data = await response.json()
              setUser(data.user)
            } else {
              // Token is invalid, clear it
              localStorage.removeItem('accessToken')
              setToken(null)
            }
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error)
        localStorage.removeItem('accessToken')
        setToken(null)
      } finally {
        setIsLoading(false)
      }
    }

    initAuth()
  }, [])

  const login = async (identifier: string, password: string) => {
    const response = await fetch('/api/v1/users/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ identifier, password }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || 'Login failed')
    }

    const data = await response.json()
    const { accessToken, user: userData } = data

    // Store token in localStorage
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('tokenType', data.tokenType || 'Bearer')

    setToken(accessToken)
    setUser(userData)

    return { user: userData, token: accessToken }
  }

  const logout = () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('tokenType')
    setToken(null)
    setUser(null)
  }

  const checkAuth = async () => {
    if (!token) return

    try {
      const response = await fetch('/api/v1/users/profile/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
      } else {
        logout()
      }
    } catch (error) {
      console.error('Auth check error:', error)
      logout()
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        logout,
        checkAuth,
        setToken,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
