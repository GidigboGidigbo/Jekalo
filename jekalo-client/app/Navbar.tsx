import Link from 'next/link'
import React from 'react'
import styled from "styled-components"

function Navbar() {
  return (
    <Wrapper>
      <Div><Link href="/">Gomyway.</Link></Div>
      <div>
        <button className="login-btn"><Link href="/login">Login</Link></button>
        <button className="signup-btn"><Link href="/signup">Sign up</Link></button>
      </div>
      {/* TODO: This will probably also hold the login, signup, dashboard pages */}
    </Wrapper>
  )
}

const Wrapper = styled.nav`
  display: flex;
  justify-content: space-between;
  height: 100px;
  align-items: center;
  background-color: cornsilk;
  border-bottom: 2px solid black;
  position: sticky;
  top: 0;
  z-index: 100;
`

const Div = styled.div`
  font-size: 2.5rem;
  padding: 16px;
  color: brown;
`

export default Navbar