import styled, { keyframes } from "styled-components"
import FeaturesListing from "@/components/FeaturesListing"
import MainDescription from "@/components/MainDescription"


export default function Home() {
  return (
    <>
      <MainDescription/>
      <FeaturesListing />
    </>
  )
}

const FadeIn = keyframes`
  0% {
    opacity: 0;
  }

  25% {
    transform: scale(1.5);
  }

  50% {
    transform: scale(1);
  }

  100% {
    opacity: 1;
  }
`
const H1 = styled.h1`
  animation: ${FadeIn} 3s ease-in-out backwards;
  animation-delay: 2s
`

