'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import styled from 'styled-components'
import { AlertCircle } from 'lucide-react'
import { useAuth } from '@/app/providers/AuthProvider'
import { RegisterDriver } from '@/components/RegisterDriver'

type FormState = {
  vehicleId: string
  dailyRateNgn: string
  securityDepositNgn: string
  pickupLocationAddress: string
  pickupLocationLat: string
  pickupLocationLong: string
  startDateTime: string
  endDateTime: string
  minimumDays: string
}

const INITIAL_STATE: FormState = {
  vehicleId: '',
  dailyRateNgn: '',
  securityDepositNgn: '',
  pickupLocationAddress: '',
  pickupLocationLat: '',
  pickupLocationLong: '',
  startDateTime: '',
  endDateTime: '',
  minimumDays: '3',
}

// TODO: fetch user's vehicles from GET /api/v1/vehicles/mine once auth/session is wired up.
const MOCK_VEHICLES: Array<{ id: string; make: string; model: string; color: string; licensePlate: string }> = []

const MIN_RENTAL_DURATION_DAYS = 3

function Page() {
  const { user } = useAuth()
  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [submitted, setSubmitted] = useState(false)

  // If user is not verified, show the RegisterDriver component
  if (!user?.isVerifiedDriver) {
    return (
      <Wrapper>
        <RegisterDriver
          onSuccess={() => {
            // User can now proceed with listing
          }}
          onCancel={() => {
            // User can navigate away or we can just keep the form hidden
          }}
        />
      </Wrapper>
    )
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function calculateDaysDifference(start: string, end: string): number {
    if (!start || !end) return 0
    const startMs = new Date(start).getTime()
    const endMs = new Date(end).getTime()
    return Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24))
  }

  // TODO: wire up to POST /api/v1/rentals/listings with geocoding for pickup_location.
  // Validation should match createRentalListingSchema from validationSchemas/rentals.js
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: Partial<Record<keyof FormState, string>> = {}

    if (!form.vehicleId) newErrors.vehicleId = 'Vehicle is required.'
    if (!form.dailyRateNgn || parseFloat(form.dailyRateNgn) <= 0) {
      newErrors.dailyRateNgn = 'Daily rate must be greater than 0.'
    }
    if (!form.securityDepositNgn || parseFloat(form.securityDepositNgn) < 0) {
      newErrors.securityDepositNgn = 'Security deposit must be 0 or greater.'
    }
    if (!form.pickupLocationAddress) newErrors.pickupLocationAddress = 'Pickup location is required.'
    if (!form.pickupLocationLat || !form.pickupLocationLong) {
      newErrors.pickupLocationLat = 'Pickup coordinates are required.'
    }
    if (!form.startDateTime) newErrors.startDateTime = 'Start date and time are required.'
    if (!form.endDateTime) newErrors.endDateTime = 'End date and time are required.'

    const daysDifference = calculateDaysDifference(form.startDateTime, form.endDateTime)
    if (daysDifference < MIN_RENTAL_DURATION_DAYS) {
      newErrors.endDateTime = `Rental listings must be at least ${MIN_RENTAL_DURATION_DAYS} days long.`
    }

    if (!form.minimumDays || parseInt(form.minimumDays) < 1) {
      newErrors.minimumDays = 'Minimum days must be at least 1.'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})

    const payload = {
      vehicle_id: form.vehicleId,
      daily_rate_ngn: parseFloat(form.dailyRateNgn),
      security_deposit_ngn: parseFloat(form.securityDepositNgn),
      pickup_location: {
        type: 'Point',
        coordinates: [parseFloat(form.pickupLocationLong), parseFloat(form.pickupLocationLat)],
      },
      start_date_time: new Date(form.startDateTime).toISOString(),
      end_date_time: new Date(form.endDateTime).toISOString(),
      minimum_days: parseInt(form.minimumDays),
    }

    console.log('rental listing payload', payload)
    setSubmitted(true)
    setForm(INITIAL_STATE)

    setTimeout(() => setSubmitted(false), 3000)
  }

  return (
    <Wrapper>
      <Header>
        <h1>List a car for rental</h1>
        <p>Earn money by renting out your vehicle to trusted renters</p>
      </Header>

      {submitted && (
        <SuccessMessage>
          <AlertCircle size={20} strokeWidth={2} />
          Rental listing posted successfully! Renters can now book your vehicle.
        </SuccessMessage>
      )}

      {MOCK_VEHICLES.length === 0 && (
        <NoVehiclesNotice>
          <p>You need to add a vehicle before listing it for rental.</p>
          <StyledLink href="/vehicles">Add a vehicle</StyledLink>
        </NoVehiclesNotice>
      )}

      <FormCard>
        <Form onSubmit={handleSubmit} noValidate>
          <FormSection>
            <SectionTitle>Vehicle</SectionTitle>

            <FormField>
              <label htmlFor="vehicleId">Select vehicle</label>
              <select
                id="vehicleId"
                name="vehicleId"
                value={form.vehicleId}
                onChange={handleChange}
                required
                disabled={MOCK_VEHICLES.length === 0}
              >
                <option value="">
                  {MOCK_VEHICLES.length === 0 ? 'No vehicles available' : 'Choose a vehicle'}
                </option>
                {MOCK_VEHICLES.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.make} {vehicle.model} • {vehicle.color} • {vehicle.licensePlate}
                  </option>
                ))}
              </select>
              {errors.vehicleId && <FieldError>{errors.vehicleId}</FieldError>}
            </FormField>
          </FormSection>

          <FormSection>
            <SectionTitle>Pricing</SectionTitle>

            <FormRow>
              <FormField>
                <label htmlFor="dailyRateNgn">Daily rate (₦)</label>
                <input
                  id="dailyRateNgn"
                  name="dailyRateNgn"
                  type="number"
                  min="0"
                  step="100"
                  placeholder="5000"
                  value={form.dailyRateNgn}
                  onChange={handleChange}
                  required
                />
                {errors.dailyRateNgn && <FieldError>{errors.dailyRateNgn}</FieldError>}
              </FormField>

              <FormField>
                <label htmlFor="securityDepositNgn">Security deposit (₦)</label>
                <input
                  id="securityDepositNgn"
                  name="securityDepositNgn"
                  type="number"
                  min="0"
                  step="100"
                  placeholder="10000"
                  value={form.securityDepositNgn}
                  onChange={handleChange}
                  required
                />
                {errors.securityDepositNgn && <FieldError>{errors.securityDepositNgn}</FieldError>}
              </FormField>
            </FormRow>
          </FormSection>

          <FormSection>
            <SectionTitle>Pickup Location</SectionTitle>

            <FormField>
              <label htmlFor="pickupLocationAddress">Address</label>
              <input
                id="pickupLocationAddress"
                name="pickupLocationAddress"
                type="text"
                placeholder="e.g., 123 Lekki Way, Lagos"
                value={form.pickupLocationAddress}
                onChange={handleChange}
                required
              />
              {errors.pickupLocationAddress && <FieldError>{errors.pickupLocationAddress}</FieldError>}
            </FormField>

            <FormRow>
              <FormField>
                <label htmlFor="pickupLocationLat">Latitude</label>
                <input
                  id="pickupLocationLat"
                  name="pickupLocationLat"
                  type="number"
                  step="0.0001"
                  min="-90"
                  max="90"
                  placeholder="6.5244"
                  value={form.pickupLocationLat}
                  onChange={handleChange}
                  required
                />
                {errors.pickupLocationLat && <FieldError>{errors.pickupLocationLat}</FieldError>}
              </FormField>

              <FormField>
                <label htmlFor="pickupLocationLong">Longitude</label>
                <input
                  id="pickupLocationLong"
                  name="pickupLocationLong"
                  type="number"
                  step="0.0001"
                  min="-180"
                  max="180"
                  placeholder="3.3792"
                  value={form.pickupLocationLong}
                  onChange={handleChange}
                  required
                />
              </FormField>
            </FormRow>
          </FormSection>

          <FormSection>
            <SectionTitle>Availability</SectionTitle>

            <FormRow>
              <FormField>
                <label htmlFor="startDateTime">Start date & time</label>
                <input
                  id="startDateTime"
                  name="startDateTime"
                  type="datetime-local"
                  value={form.startDateTime}
                  onChange={handleChange}
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
                  value={form.endDateTime}
                  onChange={handleChange}
                  required
                />
                {errors.endDateTime && <FieldError>{errors.endDateTime}</FieldError>}
              </FormField>
            </FormRow>

            {form.startDateTime && form.endDateTime && (
              <DurationInfo>
                Duration: {calculateDaysDifference(form.startDateTime, form.endDateTime)} days
                {calculateDaysDifference(form.startDateTime, form.endDateTime) < MIN_RENTAL_DURATION_DAYS && (
                  <span> (minimum {MIN_RENTAL_DURATION_DAYS} days required)</span>
                )}
              </DurationInfo>
            )}

            <FormField>
              <label htmlFor="minimumDays">Minimum rental days</label>
              <input
                id="minimumDays"
                name="minimumDays"
                type="number"
                min="1"
                placeholder="3"
                value={form.minimumDays}
                onChange={handleChange}
                required
              />
              {errors.minimumDays && <FieldError>{errors.minimumDays}</FieldError>}
            </FormField>
          </FormSection>

          <SubmitButton type="submit">Post listing</SubmitButton>
        </Form>
      </FormCard>
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

const SuccessMessage = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  margin-bottom: 24px;
  background-color: #e8f5e9;
  border-radius: 4px;
  border: 1px solid darkgreen;
  color: darkgreen;
  font-weight: 600;
  font-size: 0.95rem;
`

const FormCard = styled.div`
  background-color: antiquewhite;
  border-radius: 4px;
  border: 2px dashed brown;
  padding: 32px;
`

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 24px;
`

const FormSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const SectionTitle = styled.h2`
  color: brown;
  font-size: 0.95rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
`

const FormField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;

  label {
    font-weight: 600;
    color: brown;
  }

  input,
  select {
    height: 44px;
    padding: 0 12px;
    border: 1px solid brown;
    border-radius: 4px;
    font-size: 1rem;
    font-family: inherit;

    &:focus {
      outline: 2px solid brown;
      outline-offset: 1px;
    }

    &:disabled {
      background-color: #f5f1eb;
      color: #999;
      cursor: not-allowed;
    }
  }

  select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238B4513' d='M1 4l5 4 5-4'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 36px;
  }
`

const FormRow = styled.div`
  display: flex;
  gap: 12px;

  @media (max-width: 500px) {
    flex-direction: column;
  }

  ${FormField} {
    flex: 1;
  }
`

const FieldError = styled.span`
  color: crimson;
  font-size: 0.85rem;
`

const DurationInfo = styled.div`
  padding: 12px;
  background-color: #f5f1eb;
  border-radius: 4px;
  color: brown;
  font-size: 0.9rem;
  font-weight: 600;

  span {
    color: crimson;
    font-weight: 700;
  }
`

const SubmitButton = styled.button`
  height: 50px;
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

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const NoVehiclesNotice = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
  margin-bottom: 24px;
  background-color: #fff3cd;
  border-radius: 4px;
  border: 1px solid #ffc107;
  text-align: center;

  p {
    color: #856404;
    font-weight: 600;
    margin: 0;
  }
`

const StyledLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  padding: 0 16px;
  border-radius: 4px;
  background-color: brown;
  color: cornsilk;
  font-weight: 600;
  text-decoration: none;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.85;
  }
`

export default Page
