import React from 'react'
import styled from 'styled-components'

function MainDescription() {
  return (
    <Section>
      <p>Reduce transport hassle</p>
      <p>Commute with Gomyway</p>
    </Section>
  )
}
const Section = styled.section`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  align-self: center;
  width: 70vw;
  padding: 32px;
  margin: 56px auto;
  border-radius: 8px;
  box-shadow: 12px 12px 30px 1px gainsboro;

  p {
    text-align: left;
    font-family: "Commissioner", sans-serif;
    font-optical-sizing: auto;
    font-weight: 400;
    font-style: normal;
    font-variation-settings:
      "slnt" 0,
      "FLAR" 0,
      "VOLM" 0;
    font-size: 4.5rem;
    color: darkgrey;
    text-decoration: underline dashed;
    text-decoration-style: wavy;
    text-decoration-color: bisque;
    text-underline-offset: 8px;
  }
`

export default MainDescription