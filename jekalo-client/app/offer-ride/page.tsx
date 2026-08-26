'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import styled from 'styled-components'
import { AlertCircle } from 'lucide-react'

type FormState = {
  vehicleId: string
  fromAddress: string
  toAddress: string
  availableSeats: string
  price: string
  pickupDate: string
  pickupTime: string
}

const INITIAL_STATE: FormState = {
  vehicleId: '',
  fromAddress: '',
  toAddress: '',
  availableSeats: '',
  price: '',
  pickupDate: '',
  pickupTime: '',
}

// TODO: fetch user's vehicles from GET /api/v1/vehicles/mine once auth/session is wired up.
// Only vehicles owned by the current user should be available for ride offers.
const MOCK_VEHICLES: Array<{ id: string; make: string; model: string; color: string; licensePlate: string }> = []

function Page() {
  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [submitted, setSubmitted] = useState(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  // TODO: wire up to POST /api/v1/rides with lat/long conversion and geocoding.
  // Validation should match createRideSchema from validationSchemas/rides.js
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: Partial<Record<keyof FormState, string>> = {}

    if (!form.vehicleId) newErrors.vehicleId = 'Vehicle is required.'
    if (!form.fromAddress) newErrors.fromAddress = 'Pickup location is required.'
    if (!form.toAddress) newErrors.toAddress = 'Destination is required.'
    if (!form.availableSeats || parseInt(form.availableSeats) < 1) {
      newErrors.availableSeats = 'At least 1 seat must be available.'
    }
    if (!form.price || parseFloat(form.price) < 0) {
      newErrors.price = 'Price must be greater than or equal to 0.'
    }
    if (!form.pickupDate) newErrors.pickupDate = 'Pickup date is required.'
    if (!form.pickupTime) newErrors.pickupTime = 'Pickup time is required.'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})

    const payload = {
      vehicle_id: form.vehicleId,
      available_seat_capacity: parseInt(form.availableSeats),
      from_address: form.fromAddress,
      from_lat: 0,
      from_long: 0,
      to_address: form.toAddress,
      to_lat: 0,
      to_long: 0,
      price: parseFloat(form.price),
      pickup_date: form.pickupDate,
      pickup_time: form.pickupTime,
    }

    console.log('offer ride payload', payload)
    setSubmitted(true)
    setForm(INITIAL_STATE)

    setTimeout(() => setSubmitted(false), 3000)
  }

  return (
    <Wrapper>
      <Header>
        <h1>Offer a ride</h1>
        <p>Share your trip with riders going in the same direction and earn money</p>
      </Header>

      {submitted && (
        <SuccessMessage>
          <AlertCircle size={20} strokeWidth={2} />
          Ride posted successfully! Passengers can now book your ride.
        </SuccessMessage>
      )}

      {MOCK_VEHICLES.length === 0 && (
        <NoVehiclesNotice>
          <p>You need to add a vehicle before offering a ride.</p>
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
            <SectionTitle>Route</SectionTitle>

            <FormField>
              <label htmlFor="fromAddress">Pickup location</label>
              <input
                id="fromAddress"
                name="fromAddress"
                type="text"
                placeholder="e.g., 123 Lekki Way, Lagos"
                value={form.fromAddress}
                onChange={handleChange}
                required
              />
              {errors.fromAddress && <FieldError>{errors.fromAddress}</FieldError>}
            </FormField>

            <FormField>
              <label htmlFor="toAddress">Destination</label>
              <input
                id="toAddress"
                name="toAddress"
                type="text"
                placeholder="e.g., Victoria Island, Lagos"
                value={form.toAddress}
                onChange={handleChange}
                required
              />
              {errors.toAddress && <FieldError>{errors.toAddress}</FieldError>}
            </FormField>
          </FormSection>

          <FormSection>
            <SectionTitle>Date & Time</SectionTitle>

            <FormRow>
              <FormField>
                <label htmlFor="pickupDate">Pickup date</label>
                <input
                  id="pickupDate"
                  name="pickupDate"
                  type="date"
                  value={form.pickupDate}
                  onChange={handleChange}
                  required
                />
                {errors.pickupDate && <FieldError>{errors.pickupDate}</FieldError>}
              </FormField>

              <FormField>
                <label htmlFor="pickupTime">Pickup time</label>
                <input
                  id="pickupTime"
                  name="pickupTime"
                  type="time"
                  value={form.pickupTime}
                  onChange={handleChange}
                  required
                />
                {errors.pickupTime && <FieldError>{errors.pickupTime}</FieldError>}
              </FormField>
            </FormRow>
          </FormSection>

          <FormSection>
            <SectionTitle>Availability & Price</SectionTitle>

            <FormRow>
              <FormField>
                <label htmlFor="availableSeats">Available seats</label>
                <input
                  id="availableSeats"
                  name="availableSeats"
                  type="number"
                  min="1"
                  max="10"
                  placeholder="1"
                  value={form.availableSeats}
                  onChange={handleChange}
                  required
                />
                {errors.availableSeats && <FieldError>{errors.availableSeats}</FieldError>}
              </FormField>

              <FormField>
                <label htmlFor="price">Price (₦)</label>
                <input
                  id="price"
                  name="price"
                  type="number"
                  min="0"
                  step="100"
                  placeholder="0"
                  value={form.price}
                  onChange={handleChange}
                  required
                />
                {errors.price && <FieldError>{errors.price}</FieldError>}
              </FormField>
            </FormRow>
          </FormSection>

          <SubmitButton type="submit">Post ride</SubmitButton>
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
