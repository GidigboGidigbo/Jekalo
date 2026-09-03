'use client'

import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import styled from "styled-components"
import { useAuth } from './providers/AuthProvider'

function Navbar() {
  const router = useRouter()
  const { user, isAuthenticated, logout, isLoading } = useAuth()
  const [isMounted, setIsMounted] = useState(false)

  // Prevent hydration mismatch
  useEffect(() => {
    setIsMounted(true)
  }, [])

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  // Don't render auth-dependent content until mounted
  if (!isMounted) {
    return (
      <Wrapper>
        <Div><Link href="/">Moovquik.</Link></Div>
      </Wrapper>
    )
  }

  return (
    <Wrapper>
      <Div><Link href="/">Moovquik.</Link></Div>
      <NavRight>
        {isLoading ? (
          <span>Loading...</span>
        ) : isAuthenticated && user ? (
          <UserSection>
            <UserInfo>
              <UserName>{user.firstName} {user.lastName}</UserName>
              <UserEmail>{user.email}</UserEmail>
            </UserInfo>
            <LogoutBtn onClick={handleLogout}>Logout</LogoutBtn>
          </UserSection>
        ) : (
          <AuthButtons>
            <LoginBtn><Link href="/login">Login</Link></LoginBtn>
            <SignupBtn><Link href="/signup">Sign up</Link></SignupBtn>
          </AuthButtons>
        )}
      </NavRight>
    </Wrapper>
  )
}

const Wrapper = styled.nav`
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100px;
  padding: 0 16px;
  background-color: cornsilk;
  border-bottom: 2px solid black;
  position: sticky;
  top: 0;
  z-index: 100;
`

const Div = styled.div`
  font-size: 2.5rem;
  color: brown;
`

const NavRight = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`

const AuthButtons = styled.div`
  display: flex;
  gap: 8px;
`

const LoginBtn = styled.button`
  padding: 8px 16px;
  background-color: transparent;
  border: 2px solid brown;
  color: brown;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: brown;
    color: cornsilk;
  }

  a {
    text-decoration: none;
    color: inherit;
  }
`

const SignupBtn = styled.button`
  padding: 8px 16px;
  background-color: brown;
  border: 2px solid brown;
  color: cornsilk;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: #654321;
    border-color: #654321;
  }

  a {
    text-decoration: none;
    color: inherit;
  }
`

const UserSection = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

const UserInfo = styled.div`
  text-align: right;
`

const UserName = styled.div`
  font-weight: 600;
  color: brown;
  font-size: 0.95rem;
`

const UserEmail = styled.div`
  font-size: 0.85rem;
  color: #666;
`

const LogoutBtn = styled.button`
  padding: 8px 16px;
  background-color: crimson;
  border: none;
  color: white;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #b30000;
  }
`

export default Navbar