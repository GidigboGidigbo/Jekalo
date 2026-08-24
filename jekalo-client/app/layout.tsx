import Footer from './Footer'
import StyledComponentsRegistry from './lib/registry'
import Navbar from './Navbar'
import SideBar from '@/components/SideBar'
import styled from 'styled-components'
import "./globals.css"


export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        <StyledComponentsRegistry>
          <LayoutWrapper>
            <Navbar />
            <SideBar />
            <Main>{children}</Main>
            <Footer />
          </LayoutWrapper>
        </StyledComponentsRegistry>
      </body>
    </html>
  )
}

const LayoutWrapper = styled.div`
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
`

const Main = styled.main`
  flex: 1;
  display: flex;
  flex-direction: column
`