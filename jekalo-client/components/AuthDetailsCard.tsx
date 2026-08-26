'use client'

import React from 'react'
import styled from 'styled-components'

function AuthDetailsCard({ children }: { children: React.ReactNode }) {
  return (
    <Wrapper>
      <Card>{children}</Card>
    </Wrapper>
  )
}

const Wrapper = styled.div`
  display: flex;
  justify-content: center;
  padding: 48px 16px;
`

const Card = styled.div`
  width: 100%;
  max-width: 420px;
  background-color: antiquewhite;
  border-radius: 4px;
  border: 2px dashed brown;
  padding: 32px;
  box-shadow: 12px 12px 2px 1px chocolate;
`

export default AuthDetailsCard
