'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import styled from 'styled-components'
import AuthDetailsCard from '@/components/AuthDetailsCard'

type FormState = {
  firstName: string
  lastName: string
  email: string
  phoneNumber: string
  password: string
  confirmPassword: string
}

const INITIAL_STATE: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  password: '',
  confirmPassword: '',
}

function Page() {
  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  // Shapes the collected data to match registerSchema (validationSchemas/users.js);
  // wiring this up to POST /api/v1/users/register is a follow-up step.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (form.password !== form.confirmPassword) {
      setErrors({ confirmPassword: 'Passwords do not match.' })
      return
    }

    setErrors({})

    const payload = {
      first_name: form.firstName,
      last_name: form.lastName,
      email: form.email,
      phone_number: form.phoneNumber,
      password: form.password,
    }

    console.log('signup payload', payload)
  }

  return (
    <AuthDetailsCard>
      <Form onSubmit={handleSubmit} noValidate>
        <h1>Create your account</h1>
        <p>Basic verification is required for every account. You&apos;ll complete extra checks later if you want to offer rides, rent out a car, or list one for lease.</p>

        <Field>
          <label htmlFor="firstName">First name</label>
          <input
            id="firstName"
            name="firstName"
            value={form.firstName}
            onChange={handleChange}
            required
          />
          {errors.firstName && <FieldError>{errors.firstName}</FieldError>}
        </Field>

        <Field>
          <label htmlFor="lastName">Last name</label>
          <input
            id="lastName"
            name="lastName"
            value={form.lastName}
            onChange={handleChange}
            required
          />
          {errors.lastName && <FieldError>{errors.lastName}</FieldError>}
        </Field>

        <Field>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            required
          />
          {errors.email && <FieldError>{errors.email}</FieldError>}
        </Field>

        <Field>
          <label htmlFor="phoneNumber">Phone number</label>
          <input
            id="phoneNumber"
            name="phoneNumber"
            type="tel"
            value={form.phoneNumber}
            onChange={handleChange}
            required
          />
          {errors.phoneNumber && <FieldError>{errors.phoneNumber}</FieldError>}
        </Field>

        <Field>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            required
          />
          {errors.password && <FieldError>{errors.password}</FieldError>}
        </Field>

        <Field>
          <label htmlFor="confirmPassword">Confirm password</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={handleChange}
            required
          />
          {errors.confirmPassword && <FieldError>{errors.confirmPassword}</FieldError>}
        </Field>

        <SubmitButton type="submit">
          Sign up
        </SubmitButton>

        <FormFooter>
          Already have an account? <Link href="/login">Log in</Link>
        </FormFooter>
      </Form>
    </AuthDetailsCard>
  )
}

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;

  h1 {
    color: brown;
    font-size: 2rem;
    margin: 0;
  }

  p {
    color: darkgrey;
    margin: 0 0 8px;
  }
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;

  label {
    font-weight: 600;
    color: brown;
  }

  input {
    height: 44px;
    padding: 0 12px;
    border: 1px solid brown;
    border-radius: 4px;
    font-size: 1rem;

    &:focus {
      outline: 2px solid brown;
      outline-offset: 1px;
    }
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

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const FormFooter = styled.p`
  text-align: center;

  a {
    color: brown;
    font-weight: 600;
  }
`

export default Page
