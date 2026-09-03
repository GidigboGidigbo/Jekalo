'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import styled from 'styled-components'
import AuthDetailsCard from '@/components/AuthDetailsCard'
import { useAuth } from '@/app/providers/AuthProvider'

type FormState = {
  identifier: string
  password: string
}

type ErrorState = Partial<Record<keyof FormState | 'general', string>>

const INITIAL_STATE: FormState = {
  identifier: '',
  password: '',
}

function Page() {
  const router = useRouter()
  const { isAuthenticated, login } = useAuth()
  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [errors, setErrors] = useState<ErrorState>({})
  const [isLoading, setIsLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      router.push('/')
    }
  }, [isAuthenticated, router])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    // Clear error for this field when user starts typing
    if (errors[name as keyof FormState]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    setErrors({})
    setSuccessMessage('')

    // Validation
    if (!form.identifier) {
      setErrors((prev) => ({ ...prev, identifier: 'Email or phone number is required.' }))
      return
    }
    if (!form.password) {
      setErrors((prev) => ({ ...prev, password: 'Password is required.' }))
      return
    }

    setIsLoading(true)

    try {
      await login(form.identifier, form.password)
      setSuccessMessage('Login successful! Redirecting...')
      router.push('/')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed. Please try again.'
      setErrors((prev) => ({ ...prev, general: message }))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthDetailsCard>
      <Form onSubmit={handleSubmit} noValidate>
        <h1>Welcome back</h1>
        <p>Log in with your email or phone number to continue.</p>

        {errors.general && <GeneralError>{errors.general}</GeneralError>}
        {successMessage && <SuccessMessage>{successMessage}</SuccessMessage>}

        <Field>
          <label htmlFor="identifier">Email or phone number</label>
          <input
            id="identifier"
            name="identifier"
            value={form.identifier}
            onChange={handleChange}
            disabled={isLoading}
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
            disabled={isLoading}
            required
          />
          {errors.password && <FieldError>{errors.password}</FieldError>}
        </Field>

        <SubmitButton type="submit" disabled={isLoading}>
          {isLoading ? 'Logging in...' : 'Log in'}
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

    &:disabled {
      background-color: #f5f5f5;
      color: #999;
      cursor: not-allowed;
    }
  }
`

const FieldError = styled.span`
  color: crimson;
  font-size: 0.85rem;
`

const GeneralError = styled.div`
  background-color: #fee;
  border: 1px solid crimson;
  border-radius: 4px;
  padding: 12px;
  color: crimson;
  font-size: 0.95rem;
`

const SuccessMessage = styled.div`
  background-color: #faf8f6;
  border: 1px solid #8B4513;
  border-radius: 4px;
  padding: 12px;
  color: #8B4513;
  font-size: 0.95rem;
  font-weight: 600;
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
  transition: background-color 0.2s;

  &:hover:not(:disabled) {
    background-color: #654321;
  }

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