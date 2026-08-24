'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import styled from 'styled-components'
import { Menu, X } from 'lucide-react'

function SideBar() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <ToggleSidebar aria-label="Toggle sidebar" onClick={() => setIsOpen((prev) => !prev)}>
        {isOpen ? <X size={28} strokeWidth={2} /> : <Menu size={28} strokeWidth={2} />}
      </ToggleSidebar>
      <Panel $isOpen={isOpen}>
        <button><Link href={"/my-rides"}>View your rides</Link></button>
        <button><Link href={"/offer-ride"}>Offer rides</Link></button>
        <button><Link href={"/rent-car"}>View your rentals</Link></button>
        <button><Link href={"/list-for-rent"}>List a car for rental</Link></button>
        <button>Log out</button>
      </Panel>
    </>
  )
}

// 100px matches the Navbar height so the icon sits flush below it
const ToggleSidebar = styled.button`
  position: fixed;
  top: 150px;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background-color: brown;
  color: cornsilk;
  border: none;
  border-radius: 0 8px 8px 0;
  box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  z-index: 90;
`

const Panel = styled.aside<{ $isOpen: boolean }>`
  position: fixed;
  top: 200px;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 220px;
  padding: 16px;
  background-color: antiquewhite;
  box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.3);
  transform: translateX(${(props) => (props.$isOpen ? '0' : '-100%')});
  transition: transform 0.3s ease;
  z-index: 80;
  border-radius: 0 8px 8px 0;

  button {
    background: none;
    border: none;
    color: brown;
    text-align: left;
    font-size: 1rem;
    font-weight: bold;
    padding: 8px;

    a {
      color: inherit;
      text-decoration: none;
    }
  }
`

export default SideBar

// NOTES
// In the rides history, it will be a multi-purpose page.
// We will show rides a user is currently in (if any), rides they have booked
// rides they have completed or cancelled and any rides they offered
// This multipurpose utility will extend to other pages as well.