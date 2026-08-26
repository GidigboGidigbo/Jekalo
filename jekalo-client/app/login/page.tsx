'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import styled from 'styled-components'
import AuthDetailsCard from '@/components/AuthDetailsCard'

type FormState = {
  identifier: string
  password: string
}

const INITIAL_STATE: FormState = {
  identifier: '',
  password: '',
}

function Page() {
  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  // Shapes the collected data to match loginSchema (validationSchemas/users.js);
  // wiring this up to POST /api/v1/users/login is a follow-up step.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    setErrors({})

    const payload = {
      identifier: form.identifier,
      password: form.password,
    }

    console.log('login payload', payload)
  }

  return (
    <AuthDetailsCard>
      <Form onSubmit={handleSubmit} noValidate>
        <h1>Welcome back</h1>
        <p>Log in with your email or phone number to continue.</p>

        <Field>
          <label htmlFor="identifier">Email or phone number</label>
          <input
            id="identifier"
            name="identifier"
            value={form.identifier}
            onChange={handleChange}
            required
          />
          {errors.identifier && <FieldError>{errors.identifier}</FieldError>}
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

        <SubmitButton type="submit">
          Log in
        </SubmitButton>

        <FormFooter>
          Don&apos;t have an account? <Link href="/signup">Sign up</Link>
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