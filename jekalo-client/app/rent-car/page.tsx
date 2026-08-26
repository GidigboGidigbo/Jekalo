'use client'

import React, { useState } from 'react'
import styled from 'styled-components'
import { Search, MapPin } from 'lucide-react'

type RentalListing = {
  id: string
  vehicleId: string
  vehicleMake: string
  vehicleModel: string
  vehicleColor: string
  licensePlateNumber: string
  dailyRateNgn: number
  securityDepositNgn: number
  pickupAddress: string
  startDateTime: string
  endDateTime: string
  minimumDays: number
  status: 'pending' | 'rented' | 'cancelled' | 'returned'
}

type SearchFormData = {
  startDateTime: string
  endDateTime: string
  minDailyRateNgn: string
  maxDailyRateNgn: string
}

// TODO: wire up to GET /api/v1/rentals/listings/search once auth/session is implemented
const MOCK_LISTINGS: RentalListing[] = [
  {
    id: '1',
    vehicleId: 'vehicle-1',
    vehicleMake: 'Toyota',
    vehicleModel: 'Camry',
    vehicleColor: 'Silver',
    licensePlateNumber: 'XYZ-123-AB',
    dailyRateNgn: 15000,
    securityDepositNgn: 50000,
    pickupAddress: '123 Lekki Way, Lagos',
    startDateTime: '2026-08-25T00:00:00Z',
    endDateTime: '2026-09-10T23:59:59Z',
    minimumDays: 3,
    status: 'pending',
  },
  {
    id: '2',
    vehicleId: 'vehicle-2',
    vehicleMake: 'Honda',
    vehicleModel: 'Civic',
    vehicleColor: 'Black',
    licensePlateNumber: 'ABC-456-XY',
    dailyRateNgn: 12000,
    securityDepositNgn: 40000,
    pickupAddress: '456 Ikeja Road, Lagos',
    startDateTime: '2026-08-26T00:00:00Z',
    endDateTime: '2026-09-15T23:59:59Z',
    minimumDays: 2,
    status: 'pending',
  },
]

function Page() {
  const [searchForm, setSearchForm] = useState<SearchFormData>({
    startDateTime: '',
    endDateTime: '',
    minDailyRateNgn: '',
    maxDailyRateNgn: '',
  })
  const [hasSearched, setHasSearched] = useState(false)
  const [searchResults, setSearchResults] = useState<RentalListing[]>([])
  const [errors, setErrors] = useState<Partial<Record<keyof SearchFormData, string>>>({})

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setSearchForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: Partial<Record<keyof SearchFormData, string>> = {}

    if (!searchForm.startDateTime) newErrors.startDateTime = 'Start date and time is required.'
    if (!searchForm.endDateTime) newErrors.endDateTime = 'End date and time is required.'

    if (searchForm.startDateTime && searchForm.endDateTime) {
      const startMs = new Date(searchForm.startDateTime).getTime()
      const endMs = new Date(searchForm.endDateTime).getTime()

      if (endMs <= startMs) {
        newErrors.endDateTime = 'End date and time must be after start date and time.'
      }
    }

    if (
      searchForm.minDailyRateNgn &&
      searchForm.maxDailyRateNgn &&
      parseFloat(searchForm.minDailyRateNgn) > parseFloat(searchForm.maxDailyRateNgn)
    ) {
      newErrors.maxDailyRateNgn = 'Maximum rate must be greater than or equal to minimum rate.'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})
    setHasSearched(true)
    // TODO: wire up to GET /api/v1/rentals/listings/search with proper query parameters:
    // start_date_time, end_date_time, min_daily_rate_ngn (optional), max_daily_rate_ngn (optional)
    setSearchResults(MOCK_LISTINGS)
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-NG', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <Wrapper>
      <Header>
        <h1>Rent a car</h1>
        <p>Find available vehicles for your next trip</p>
      </Header>

      <SearchCard>
        <SearchForm onSubmit={handleSearch}>
          <FormRow>
            <FormField>
              <label htmlFor="startDateTime">Start date & time</label>
              <input
                id="startDateTime"
                name="startDateTime"
                type="datetime-local"
                value={searchForm.startDateTime}
                onChange={handleSearchChange}
                required
              />
              {errors.startDateTime && <FieldError>{errors.startDateTime}</FieldError>}
            </FormField>

            <FormField>
              <label htmlFor="endDateTime">End date & time</label>
              <input
                id="endDateTime"
                name="endDateTime"
                type="datetime-local"
                value={searchForm.endDateTime}
                onChange={handleSearchChange}
                required
              />
              {errors.endDateTime && <FieldError>{errors.endDateTime}</FieldError>}
            </FormField>
          </FormRow>

          <FormRow>
            <FormField>
              <label htmlFor="minDailyRateNgn">Min. daily rate (₦)</label>
              <input
                id="minDailyRateNgn"
                name="minDailyRateNgn"
                type="number"
                min="0"
                step="1000"
                placeholder="No minimum"
                value={searchForm.minDailyRateNgn}
                onChange={handleSearchChange}
              />
            </FormField>

            <FormField>
              <label htmlFor="maxDailyRateNgn">Max. daily rate (₦)</label>
              <input
                id="maxDailyRateNgn"
                name="maxDailyRateNgn"
                type="number"
                min="0"
                step="1000"
                placeholder="No maximum"
                value={searchForm.maxDailyRateNgn}
                onChange={handleSearchChange}
              />
              {errors.maxDailyRateNgn && <FieldError>{errors.maxDailyRateNgn}</FieldError>}
            </FormField>
          </FormRow>

          <SearchButton type="submit">
            <Search size={18} strokeWidth={2} />
            Search cars
          </SearchButton>
        </SearchForm>
      </SearchCard>

      {hasSearched && (
        <ResultsSection>
          <h2>Available cars</h2>
          {searchResults.length === 0 ? (
            <NoResults>
              <p>No cars available for your search. Try different dates or price range.</p>
            </NoResults>
          ) : (
            <ListingList>
              {searchResults.map((listing) => (
                <ListingCard key={listing.id}>
                  <ListingHeader>
                    <VehicleInfo>
                      <VehicleName>
                        {listing.vehicleMake} {listing.vehicleModel}
                      </VehicleName>
                      <VehicleDetails>
                        {listing.vehicleColor} • {listing.licensePlateNumber}
                      </VehicleDetails>
                    </VehicleInfo>
                    <PriceSection>
                      <DailyRate>{formatCurrency(listing.dailyRateNgn)}</DailyRate>
                      <PerDay>per day</PerDay>
                    </PriceSection>
                  </ListingHeader>

                  <LocationSection>
                    <MapPin size={16} strokeWidth={2} />
                    <span>{listing.pickupAddress}</span>
                  </LocationSection>

                  <AvailabilitySection>
                    <AvailabilityRow>
                      <Label>Available:</Label>
                      <Value>
                        {formatDate(listing.startDateTime)} - {formatDate(listing.endDateTime)}
                      </Value>
                    </AvailabilityRow>
                    <AvailabilityRow>
                      <Label>Min. rental:</Label>
                      <Value>{listing.minimumDays} day{listing.minimumDays === 1 ? '' : 's'}</Value>
                    </AvailabilityRow>
                    <AvailabilityRow>
                      <Label>Security deposit:</Label>
                      <Value>{formatCurrency(listing.securityDepositNgn)}</Value>
                    </AvailabilityRow>
                  </AvailabilitySection>

                  <BookButton>Book now</BookButton>
                </ListingCard>
              ))}
            </ListingList>
          )}
        </ResultsSection>
      )}
    </Wrapper>
  )
}

const Wrapper = styled.div`
  max-width: 700px;
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

const ListingList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const ListingCard = styled.div`
  background-color: antiquewhite;
  border-radius: 4px;
  border: 2px dashed brown;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const ListingHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
`

const VehicleInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
`

const VehicleName = styled.div`
  color: brown;
  font-weight: 700;
  font-size: 1.1rem;
`

const VehicleDetails = styled.div`
  color: darkgrey;
  font-size: 0.85rem;
`

const PriceSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
`

const DailyRate = styled.div`
  color: brown;
  font-weight: 700;
  font-size: 1.2rem;
`

const PerDay = styled.div`
  color: darkgrey;
  font-size: 0.8rem;
`

const LocationSection = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: brown;
  font-size: 0.9rem;

  svg {
    color: brown;
    flex-shrink: 0;
  }
`

const AvailabilitySection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 0;
  border-top: 1px solid brown;
  border-bottom: 1px solid brown;
`

const AvailabilityRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
`

const Label = styled.span`
  color: brown;
  font-weight: 600;
`

const Value = styled.span`
  color: darkgrey;
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

const FieldError = styled.span`
  color: crimson;
  font-size: 0.85rem;
`

export default Page
