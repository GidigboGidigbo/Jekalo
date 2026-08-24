import Link from 'next/link'
import React from 'react'
import styled from "styled-components"
import { Car, Users, KeyRound, CarFront } from "lucide-react"

const features = [
  {
    title: "Book a ride",
    description: "Find a driver headed your way and get to your destination.",
    href: "/book-ride",
    icon: Car,
    btnText: "Book Now",
  },
  {
    title: "Offer a ride",
    description: "Share your trip with riders going in the same direction.",
    href: "/offer-ride",
    icon: Users,
    btnText: "Offer a ride",
  },
  {
    title: "List a car for rental",
    description: "Earn money by listing your car for others to rent.",
    href: "/list-for-rent",
    icon: KeyRound,
    btnText: "Lease your car",
  },
  {
    title: "Rent a car",
    description: "Browse available cars and rent one for your next trip.",
    href: "/rent-car",
    icon: CarFront,
    btnText: "Rent a car",
  },
]

function FeaturesListing() {
  return (
    <Wrapper>
      {features.map((feature) => (
        <Feature key={feature.href}>
          <TextColumn>
            <h1>{feature.title}</h1>
            <h3>{feature.description}</h3>
          </TextColumn>
          <Card>
            <IconWrapper>
              <feature.icon size={64} strokeWidth={1.5} />
            </IconWrapper>
            <Link href={feature.href}>{feature.btnText}</Link>
          </Card>
        </Feature>
      ))}
    </Wrapper>
  )
}

const Wrapper = styled.div`
  display: grid;
  grid-template-rows: repeat(4, minmax(250px, 1fr));
  justify-content: center;

  > div {
    background-color: brown;
    color: cornsilk;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
    position: relative;
  }

  > div:not(:last-child)::after {
    content: '';
    position: absolute;
    bottom: -12px;
    left: 0;
    right: 0;
    height: 4px;
    background-color: black;
  }

  > div:nth-of-type(2n) {
    background-color: cornsilk;
    color: brown
  }

  > div:nth-of-type(2n+1) > div:last-child {
    background-color: cornsilk;
  }

  
  > div:nth-of-type(2n) > div:last-child {
    background-color: #B87C4C;
    }
    
  > div:nth-of-type(2n+1) > div:last-child a {
    background-color: brown;
    color: cornsilk;
  }

  > div:nth-of-type(2n) > div:last-child a {
    background-color: cornsilk;
    color: brown;
  }

  // odd-numbered icon wrappers
  > div:nth-of-type(2n+1) > div:last-child div {
    background-color: brown;
    color: cornsilk;
  }

  // even-numbered icon wrappers
  > div:nth-of-type(2n) > div:last-child div {
    background-color: cornsilk;
    color: brown;
  }
`

const Feature = styled.div`
  display: flex;
  justify-content: space-around;
  padding: 8px;
  width: 70vw;
`

const TextColumn = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 250px;
  border-radius: 8px;
  padding: 8px;

  h1 {
    font-size: 2.5rem;
    line-height: 0.9;
  };
`

const Card = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-radius: 8px;
  padding: 8px;
  width: 200px;

  a {
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: opacity 0.2s ease;
    
    &:hover {
      opacity: 0.8;
    }
  }
`

const IconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 70%;
  border-radius: 8px;
`

export default FeaturesListing