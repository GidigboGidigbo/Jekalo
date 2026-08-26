'use client'

import React, { useState } from 'react'
import styled from 'styled-components'
import { Search } from 'lucide-react'

type Ride = {
  id: string
  driverId: string
  driverName: string
  vehicleMake: string
  vehicleModel: string
  fromAddress: string
  toAddress: string
  pickupDate: string
  pickupTime: string
  price: string
  availableSeats: number
  status: 'PENDING' | 'STARTED' | 'COMPLETED' | 'CANCELLED'
}

type SearchFormData = {
  fromAddress: string
  toAddress: string
  pickupDate: string
}

// TODO: wire up to GET /api/v1/rides/search once the client has auth/session
// handling in place. The endpoint exists server-side and accepts:
// { from_lat, from_long, to_lat, to_long, radius }
const MOCK_RIDES: Ride[] = [
  {
    id: '1',
    driverId: 'driver-1',
    driverName: 'Chioma O.',
    vehicleMake: 'Toyota',
    vehicleModel: 'Camry',
    fromAddress: '123 Lekki Way, Lagos',
    toAddress: 'Victoria Island, Lagos',
    pickupDate: '2026-08-25',
    pickupTime: '09:00',
    price: '₦2,500',
    availableSeats: 2,
    status: 'PENDING',
  },
  {
    id: '2',
    driverId: 'driver-2',
    driverName: 'Tunde A.',
    vehicleMake: 'Honda',
    vehicleModel: 'Civic',
    fromAddress: '456 Ikeja Road, Lagos',
    toAddress: '789 Ajose Adeogun, VI',
    pickupDate: '2026-08-25',
    pickupTime: '10:30',
    price: '₦3,000',
    availableSeats: 1,
    status: 'PENDING',
  },
]

function Page() {
  const [searchForm, setSearchForm] = useState<SearchFormData>({
    fromAddress: '',
    toAddress: '',
    pickupDate: '',
  })
  const [hasSearched, setHasSearched] = useState(false)
  const [searchResults, setSearchResults] = useState<Ride[]>([])

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setSearchForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setHasSearched(true)
    setSearchResults(MOCK_RIDES)
  }

  return (
    <Wrapper>
      <Header>
        <h1>Find a ride</h1>
        <p>Search for available rides to your destination</p>
      </Header>

      <SearchCard>
        <SearchForm onSubmit={handleSearch}>
          <FormRow>
            <FormField>
              <label htmlFor="fromAddress">From</label>
              <input
                id="fromAddress"
                name="fromAddress"
                type="text"
                placeholder="Pickup location"
                value={searchForm.fromAddress}
                onChange={handleSearchChange}
                required
              />
            </FormField>

            <FormField>
              <label htmlFor="toAddress">To</label>
              <input
                id="toAddress"
                name="toAddress"
                type="text"
                placeholder="Destination"
                value={searchForm.toAddress}
                onChange={handleSearchChange}
                required
              />
            </FormField>
          </FormRow>

          <FormRow>
            <FormField>
              <label htmlFor="pickupDate">Date</label>
              <input
                id="pickupDate"
                name="pickupDate"
                type="date"
                value={searchForm.pickupDate}
                onChange={handleSearchChange}
                required
              />
            </FormField>
          </FormRow>

          <SearchButton type="submit">
            <Search size={18} strokeWidth={2} />
            Search rides
          </SearchButton>
        </SearchForm>
      </SearchCard>

      {hasSearched && (
        <ResultsSection>
          <h2>Available rides</h2>
          {searchResults.length === 0 ? (
            <NoResults>
              <p>No rides found for your search. Try different dates or locations.</p>
            </NoResults>
          ) : (
            <RideList>
              {searchResults.map((ride) => (
                <RideCard key={ride.id}>
                  <RideHeader>
                    <DriverInfo>
                      <DriverName>{ride.driverName}</DriverName>
                      <VehicleInfo>
                        {ride.vehicleMake} {ride.vehicleModel}
                      </VehicleInfo>
                    </DriverInfo>
                    <Price>{ride.price}</Price>
                  </RideHeader>

                  <RouteSection>
                    <RoutePoint>
                      <RouteLabel>From</RouteLabel>
                      <RouteAddress>{ride.fromAddress}</RouteAddress>
                    </RoutePoint>
                    <Divider />
                    <RoutePoint>
                      <RouteLabel>To</RouteLabel>
                      <RouteAddress>{ride.toAddress}</RouteAddress>
                    </RoutePoint>
                  </RouteSection>

                  <TimeAndSeatsRow>
                    <TimeInfo>
                      <span>{ride.pickupDate}</span>
                      <span>&middot;</span>
                      <span>{ride.pickupTime}</span>
                    </TimeInfo>
                    <SeatsInfo>
                      {ride.availableSeats} seat{ride.availableSeats === 1 ? '' : 's'} available
                    </SeatsInfo>
                  </TimeAndSeatsRow>

                  <BookButton>Book</BookButton>
                </RideCard>
              ))}
            </RideList>
          )}
        </ResultsSection>
      )}
    </Wrapper>
  )
}

const Wrapper = styled.div`
  max-width: 600px;
  margin: 0 auto;
  padding: 24px 16px;
`

const Header = styled.div`
  margin-bottom: 24px;

  h1 {
    color: brown;
    font-size: 2rem;
    margin: 0 0 8px;
  }

  p {
    color: darkgrey;
    margin: 0;
  }
`

const SearchCard = styled.div`
  background-color: antiquewhite;
  border-radius: 4px;
  border: 2px dashed brown;
  padding: 24px;
  margin-bottom: 32px;
`

const SearchForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const FormRow = styled.div`
  display: flex;
  gap: 12px;

  @media (max-width: 500px) {
    flex-direction: column;
  }
`

const FormField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;

  label {
    font-weight: 600;
    color: brown;
    font-size: 0.9rem;
  }

  input {
    height: 40px;
    padding: 0 12px;
    border: 1px solid brown;
    border-radius: 4px;
    font-size: 0.95rem;
    font-family: inherit;

    &:focus {
      outline: 2px solid brown;
      outline-offset: 1px;
    }

    &::placeholder {
      color: #999;
    }
  }
`

const SearchButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 44px;
  border: none;
  border-radius: 4px;
  background-color: brown;
  color: cornsilk;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.85;
  }
`

const ResultsSection = styled.section`
  h2 {
    color: brown;
    font-size: 1.25rem;
    margin: 0 0 16px;
  }
`

const RideList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const RideCard = styled.div`
  background-color: antiquewhite;
  border-radius: 4px;
  border: 2px dashed brown;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const RideHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
`

const DriverInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const DriverName = styled.div`
  color: brown;
  font-weight: 700;
  font-size: 1rem;
`

const VehicleInfo = styled.div`
  color: darkgrey;
  font-size: 0.85rem;
`

const Price = styled.div`
  color: brown;
  font-weight: 700;
  font-size: 1.1rem;
`

const RouteSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
`

const RoutePoint = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const RouteLabel = styled.div`
  color: brown;
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`

const RouteAddress = styled.div`
  color: darkgrey;
  font-size: 0.9rem;
`

const Divider = styled.div`
  height: 1px;
  background-color: brown;
  opacity: 0.2;
  margin: 4px 0;
`

const TimeAndSeatsRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: darkgrey;
  font-size: 0.85rem;
`

const TimeInfo = styled.div`
  display: flex;
  gap: 4px;
  align-items: center;
`

const SeatsInfo = styled.div`
  font-weight: 600;
  color: brown;
`

const BookButton = styled.button`
  width: 100%;
  height: 44px;
  border: none;
  border-radius: 4px;
  background-color: brown;
  color: cornsilk;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.85;
  }
`

const NoResults = styled.div`
  background-color: antiquewhite;
  border-radius: 4px;
  border: 2px dashed brown;
  padding: 32px;
  text-align: center;

  p {
    color: brown;
    margin: 0;
  }
`

export default Page
