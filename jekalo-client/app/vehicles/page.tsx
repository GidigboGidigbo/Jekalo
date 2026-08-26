'use client'

import React, { useState } from 'react'
import styled from 'styled-components'
import { Plus, Trash2, AlertCircle } from 'lucide-react'

type Vehicle = {
  id: string
  make: string
  model: string
  manufacturingYear: string
  color: string
  bodyType: string
  pictures: string[]
  seatingCapacity: number
  licensePlateNumber: string
}

type FormState = {
  make: string
  model: string
  manufacturingYear: string
  color: string
  bodyType: string
  pictures: string
  seatingCapacity: string
  licensePlateNumber: string
}

const INITIAL_FORM: FormState = {
  make: '',
  model: '',
  manufacturingYear: '',
  color: '',
  bodyType: '',
  pictures: '',
  seatingCapacity: '',
  licensePlateNumber: '',
}

// TODO: wire up to GET /api/v1/vehicles/mine once auth/session is implemented
const MOCK_VEHICLES: Vehicle[] = []

const BODY_TYPES = ['Sedan', 'SUV', 'Truck', 'Van', 'Coupe', 'Hatchback', 'Wagon']

function Page() {
  const [vehicles, setVehicles] = useState<Vehicle[]>(MOCK_VEHICLES)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [submitted, setSubmitted] = useState(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  // TODO: wire up to POST /api/v1/vehicles with validation matching registerVehicleSchema
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: Partial<Record<keyof FormState, string>> = {}

    if (!form.make.trim()) newErrors.make = 'Make is required.'
    if (!form.model.trim()) newErrors.model = 'Model is required.'
    if (!form.manufacturingYear.trim()) newErrors.manufacturingYear = 'Manufacturing year is required.'
    if (!form.color.trim()) newErrors.color = 'Color is required.'
    if (!form.bodyType.trim()) newErrors.bodyType = 'Body type is required.'
    if (!form.pictures.trim()) newErrors.pictures = 'At least one picture URL is required.'
    if (!form.seatingCapacity || parseInt(form.seatingCapacity) < 1) {
      newErrors.seatingCapacity = 'Seating capacity must be at least 1.'
    }
    if (!form.licensePlateNumber.trim()) newErrors.licensePlateNumber = 'License plate number is required.'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})

    const newVehicle: Vehicle = {
      id: `vehicle-${Date.now()}`,
      make: form.make.trim(),
      model: form.model.trim(),
      manufacturingYear: form.manufacturingYear.trim(),
      color: form.color.trim(),
      bodyType: form.bodyType.trim(),
      pictures: form.pictures.split('\n').filter((p) => p.trim()),
      seatingCapacity: parseInt(form.seatingCapacity),
      licensePlateNumber: form.licensePlateNumber.trim(),
    }

    setVehicles((prev) => [...prev, newVehicle])
    setForm(INITIAL_FORM)
    setShowForm(false)
    setSubmitted(true)

    setTimeout(() => setSubmitted(false), 3000)
  }

  function handleDelete(id: string) {
    // TODO: wire up to DELETE /api/v1/vehicles/:id
    setVehicles((prev) => prev.filter((v) => v.id !== id))
  }

  return (
    <Wrapper>
      <Header>
        <h1>My Vehicles</h1>
        <p>Manage the vehicles you own and want to use for rides or rentals</p>
      </Header>

      {submitted && (
        <SuccessMessage>
          <AlertCircle size={20} strokeWidth={2} />
          Vehicle added successfully!
        </SuccessMessage>
      )}

      {vehicles.length === 0 ? (
        <EmptyState>
          <p>You haven&apos;t added any vehicles yet.</p>
          <p>Add a vehicle to start offering rides or listing cars for rental.</p>
          <ActionButton onClick={() => setShowForm(!showForm)}>
            <Plus size={20} strokeWidth={2} />
            Add vehicle
          </ActionButton>
        </EmptyState>
      ) : (
        <>
          <VehicleList>
            {vehicles.map((vehicle) => (
              <VehicleCard key={vehicle.id}>
                <VehicleHeader>
                  <VehicleTitle>
                    {vehicle.make} {vehicle.model}
                  </VehicleTitle>
                  <DeleteButton onClick={() => handleDelete(vehicle.id)}>
                    <Trash2 size={18} strokeWidth={2} />
                  </DeleteButton>
                </VehicleHeader>

                <VehicleDetails>
                  <DetailRow>
                    <Label>Year:</Label>
                    <Value>{vehicle.manufacturingYear}</Value>
                  </DetailRow>
                  <DetailRow>
                    <Label>Color:</Label>
                    <Value>{vehicle.color}</Value>
                  </DetailRow>
                  <DetailRow>
                    <Label>Type:</Label>
                    <Value>{vehicle.bodyType}</Value>
                  </DetailRow>
                  <DetailRow>
                    <Label>Seating:</Label>
                    <Value>{vehicle.seatingCapacity} seats</Value>
                  </DetailRow>
                  <DetailRow>
                    <Label>License Plate:</Label>
                    <Value>{vehicle.licensePlateNumber}</Value>
                  </DetailRow>
                </VehicleDetails>
              </VehicleCard>
            ))}
          </VehicleList>

          {!showForm && (
            <AddButton onClick={() => setShowForm(true)}>
              <Plus size={20} strokeWidth={2} />
              Add another vehicle
            </AddButton>
          )}
        </>
      )}

      {showForm && (
        <FormCard>
          <FormTitle>Add Vehicle</FormTitle>
          <Form onSubmit={handleSubmit} noValidate>
            <FormRow>
              <FormField>
                <label htmlFor="make">Make</label>
                <input
                  id="make"
                  name="make"
                  type="text"
                  placeholder="e.g., Toyota"
                  value={form.make}
                  onChange={handleChange}
                  required
                />
                {errors.make && <FieldError>{errors.make}</FieldError>}
              </FormField>

              <FormField>
                <label htmlFor="model">Model</label>
                <input
                  id="model"
                  name="model"
                  type="text"
                  placeholder="e.g., Camry"
                  value={form.model}
                  onChange={handleChange}
                  required
                />
                {errors.model && <FieldError>{errors.model}</FieldError>}
              </FormField>
            </FormRow>

            <FormRow>
              <FormField>
                <label htmlFor="manufacturingYear">Manufacturing Year</label>
                <input
                  id="manufacturingYear"
                  name="manufacturingYear"
                  type="text"
                  placeholder="e.g., 2022"
                  value={form.manufacturingYear}
                  onChange={handleChange}
                  required
                />
                {errors.manufacturingYear && <FieldError>{errors.manufacturingYear}</FieldError>}
              </FormField>

              <FormField>
                <label htmlFor="color">Color</label>
                <input
                  id="color"
                  name="color"
                  type="text"
                  placeholder="e.g., Silver"
                  value={form.color}
                  onChange={handleChange}
                  required
                />
                {errors.color && <FieldError>{errors.color}</FieldError>}
              </FormField>
            </FormRow>

            <FormField>
              <label htmlFor="bodyType">Body Type</label>
              <select
                id="bodyType"
                name="bodyType"
                value={form.bodyType}
                onChange={handleChange}
                required
              >
                <option value="">Select body type</option>
                {BODY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              {errors.bodyType && <FieldError>{errors.bodyType}</FieldError>}
            </FormField>

            <FormField>
              <label htmlFor="seatingCapacity">Seating Capacity</label>
              <input
                id="seatingCapacity"
                name="seatingCapacity"
                type="number"
                min="1"
                max="10"
                placeholder="1"
                value={form.seatingCapacity}
                onChange={handleChange}
                required
              />
              {errors.seatingCapacity && <FieldError>{errors.seatingCapacity}</FieldError>}
            </FormField>

            <FormField>
              <label htmlFor="licensePlateNumber">License Plate Number</label>
              <input
                id="licensePlateNumber"
                name="licensePlateNumber"
                type="text"
                placeholder="e.g., ABC-123-XY"
                value={form.licensePlateNumber}
                onChange={handleChange}
                required
              />
              {errors.licensePlateNumber && <FieldError>{errors.licensePlateNumber}</FieldError>}
            </FormField>

            <FormField>
              <label htmlFor="pictures">
                Pictures (one URL per line)
              </label>
              <textarea
                id="pictures"
                name="pictures"
                placeholder="https://example.com/photo1.jpg&#10;https://example.com/photo2.jpg"
                value={form.pictures}
                onChange={(e) => setForm((prev) => ({ ...prev, pictures: e.target.value }))}
                rows={4}
                required
              />
              {errors.pictures && <FieldError>{errors.pictures}</FieldError>}
            </FormField>

            <ButtonRow>
              <SubmitButton type="submit">Add vehicle</SubmitButton>
              <CancelButton type="button" onClick={() => setShowForm(false)}>
                Cancel
              </CancelButton>
            </ButtonRow>
          </Form>
        </FormCard>
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

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 48px 24px;
  background-color: antiquewhite;
  border-radius: 4px;
  border: 2px dashed brown;
  text-align: center;

  p {
    color: brown;
    margin: 0;
  }

  p:first-of-type {
    font-weight: 600;
  }
`

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 16px;
  border-radius: 4px;
  background-color: brown;
  color: cornsilk;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.85;
  }
`

const VehicleList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
`

const VehicleCard = styled.div`
  background-color: antiquewhite;
  border-radius: 4px;
  border: 2px dashed brown;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const VehicleHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`

const VehicleTitle = styled.div`
  color: brown;
  font-weight: 700;
  font-size: 1.1rem;
`

const DeleteButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background-color: transparent;
  border: 1px solid crimson;
  border-radius: 4px;
  color: crimson;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #ffe8e8;
  }
`

const VehicleDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const DetailRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
`

const Label = styled.span`
  color: brown;
  font-weight: 600;
`

const Value = styled.span`
  color: darkgrey;
`

const AddButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 44px;
  border-radius: 4px;
  background-color: brown;
  color: cornsilk;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.85;
  }
`

const FormCard = styled.div`
  background-color: antiquewhite;
  border-radius: 4px;
  border: 2px dashed brown;
  padding: 32px;
  margin-top: 24px;
`

const FormTitle = styled.h2`
  color: brown;
  font-size: 1.25rem;
  margin: 0 0 20px;
`

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  select,
  textarea {
    padding: 8px 12px;
    border: 1px solid brown;
    border-radius: 4px;
    font-size: 1rem;
    font-family: inherit;

    &:focus {
      outline: 2px solid brown;
      outline-offset: 1px;
    }
  }

  input,
  select {
    height: 40px;
  }

  textarea {
    resize: vertical;
    min-height: 80px;
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

const ButtonRow = styled.div`
  display: flex;
  gap: 12px;
`

const SubmitButton = styled.button`
  flex: 1;
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

const CancelButton = styled.button`
  flex: 1;
  height: 44px;
  border: 2px solid brown;
  border-radius: 4px;
  background-color: transparent;
  color: brown;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #f5f1eb;
  }
`

export default Page
