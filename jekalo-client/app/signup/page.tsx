'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import styled from 'styled-components'
import AuthDetailsCard from '@/components/AuthDetailsCard'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/providers/AuthProvider'

type FormState = {
  firstName: string
  lastName: string
  email: string
  phoneNumber: string
  password: string
  confirmPassword: string
  identifierType: 'bvn' | 'nin' | ''
  identifier: string
  selfie: string
}

type ErrorState = Partial<Record<keyof FormState | 'general' | 'server', string>>

const INITIAL_STATE: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  password: '',
  confirmPassword: '',
  identifierType: '',
  identifier: '',
  selfie: '',
}

const VALIDATION = {
  firstName: { pattern: /.{2,}/, message: 'First name must be at least 2 characters.' },
  lastName: { pattern: /.{2,}/, message: 'Last name must be at least 2 characters.' },
  email: { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'A valid email address is required.' },
  phoneNumber: { pattern: /.+/, message: 'Phone number is required.' },
  password: { pattern: /^(?=.*[A-Za-z])(?=.*\d).{8,}$/, message: 'Password must be at least 8 characters and contain both letters and numbers.' },
  identifier: { pattern: /^\d{11}$/, message: 'BVN/NIN must be exactly 11 digits.' },
  selfie: { minLength: 100, message: 'Please provide a valid selfie image.' },
}

type Step = 1 | 2 | 3

function Page() {
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const [currentStep, setCurrentStep] = useState<Step>(1)
  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [errors, setErrors] = useState<ErrorState>({})
  const [isLoading, setIsLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [pendingStream, setPendingStream] = useState<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      router.push('/')
    }
  }, [isAuthenticated, router])

  // Attach stream to video element once it's available
  useEffect(() => {
    if (isCameraActive && pendingStream && videoRef.current) {
      videoRef.current.srcObject = pendingStream
      streamRef.current = pendingStream
      setPendingStream(null)
    }
  }, [isCameraActive, pendingStream])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (errors[name as keyof FormState]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }))
    }
  }

  function handleIdentifierChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { value } = e.target
    const numericOnly = value.replace(/\D/g, '')
    setForm((prev) => ({ ...prev, identifier: numericOnly }))
    if (errors.identifier) {
      setErrors((prev) => ({ ...prev, identifier: undefined }))
    }
  }

  function validateStep(step: Step): boolean {
    const stepErrors: ErrorState = {}

    if (step === 1) {
      if (!form.firstName || !VALIDATION.firstName.pattern.test(form.firstName)) {
        stepErrors.firstName = VALIDATION.firstName.message
      }
      if (!form.lastName || !VALIDATION.lastName.pattern.test(form.lastName)) {
        stepErrors.lastName = VALIDATION.lastName.message
      }
      if (!form.email || !VALIDATION.email.pattern.test(form.email)) {
        stepErrors.email = VALIDATION.email.message
      }
      if (!form.phoneNumber || !VALIDATION.phoneNumber.pattern.test(form.phoneNumber)) {
        stepErrors.phoneNumber = VALIDATION.phoneNumber.message
      }
      if (!form.password || !VALIDATION.password.pattern.test(form.password)) {
        stepErrors.password = VALIDATION.password.message
      }
      if (form.password !== form.confirmPassword) {
        stepErrors.confirmPassword = 'Passwords do not match.'
      }
    } else if (step === 2) {
      if (!form.identifierType) {
        stepErrors.identifierType = 'Please select BVN or NIN.'
      }
      if (!form.identifier || !VALIDATION.identifier.pattern.test(form.identifier)) {
        stepErrors.identifier = VALIDATION.identifier.message
      }
    } else if (step === 3) {
      if (!form.selfie || form.selfie.length < VALIDATION.selfie.minLength) {
        stepErrors.selfie = VALIDATION.selfie.message
      }
    }

    setErrors(stepErrors)
    return Object.keys(stepErrors).length === 0
  }

  function handleNextStep() {
    if (!validateStep(currentStep)) return
    setCurrentStep((currentStep) => currentStep + 1 as Step)
  }

  function handlePrevStep() {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as Step)
      setErrors({})
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const base64String = event.target?.result as string
      setForm((prev) => ({ ...prev, selfie: base64String }))
      if (errors.selfie) {
        setErrors((prev) => ({ ...prev, selfie: undefined }))
      }
    }
    reader.readAsDataURL(file)
  }

  async function startCamera() {
    try {
      console.log("starting camera")
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      setPendingStream(stream)
      setIsCameraActive(true)
    } catch {
      setErrors((prev) => ({ ...prev, general: 'Unable to access camera. Please use file upload instead.' }))
    }
  }

  function capturePhoto() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (video && canvas) {
      const context = canvas.getContext('2d')
      if (context) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        context.drawImage(video, 0, 0)
        const base64String = canvas.toDataURL('image/jpeg')
        setForm((prev) => ({ ...prev, selfie: base64String }))
        if (errors.selfie) {
          setErrors((prev) => ({ ...prev, selfie: undefined }))
        }
        stopCamera()
      }
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setIsCameraActive(false)
  }

  async function handleSubmit() {
    if (!validateStep(3)) return
    setIsLoading(true)
    setErrors({})

    try {
      const response = await fetch('/api/v1/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phoneNumber: form.phoneNumber,
          password: form.password,
          selfie: form.selfie,
          [form.identifierType as 'bvn' | 'nin']: form.identifier,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setErrors((prev) => ({
          ...prev,
          server: data.error?.message || 'Registration failed.',
        }))
        setIsLoading(false)
        return
      }

      setSuccessMessage('Account created successfully! Redirecting to login...')

      await new Promise((resolve) => setTimeout(resolve, 1000))
      router.push('/login')
    } catch {
      setErrors((prev) => ({
        ...prev,
        server: 'An unexpected error occurred.',
      }))
      setIsLoading(false)
    }
  }

  return (
    <AuthDetailsCard>
      <Form noValidate>
        <Header>
          <h1>Create your account</h1>
          <p>Basic verification is required for every account. You&apos;ll complete extra checks later if you want to offer rides, rent out a car, or list one for lease.</p>
          <StepIndicator>Step {currentStep} of 3</StepIndicator>
        </Header>

        {errors.server && <GeneralError>{errors.server}</GeneralError>}
        {successMessage && <SuccessMessage>{successMessage}</SuccessMessage>}

        {currentStep === 1 && (
          <StepContent>
            <StepTitle>Account Information</StepTitle>

            <Field>
              <label htmlFor="firstName">First name</label>
              <input
                id="firstName"
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
                placeholder="John"
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
                placeholder="Doe"
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
                placeholder="john@example.com"
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
                placeholder="+234 801 234 5678"
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
                placeholder="At least 8 characters with letters and numbers"
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
                placeholder="Re-enter your password"
                required
              />
              {errors.confirmPassword && <FieldError>{errors.confirmPassword}</FieldError>}
            </Field>
          </StepContent>
        )}

        {currentStep === 2 && (
          <StepContent>
            <StepTitle>Verify Your Identity</StepTitle>
            <StepDescription>Choose whether you want to verify with your Bank Verification Number (BVN) or National Identification Number (NIN)</StepDescription>

            <Field>
              <label htmlFor="identifierType">Verification Type</label>
              <select
                id="identifierType"
                name="identifierType"
                value={form.identifierType}
                onChange={handleChange}
                required
              >
                <option value="">-- Select BVN or NIN --</option>
                <option value="bvn">Bank Verification Number (BVN)</option>
                <option value="nin">National Identification Number (NIN)</option>
              </select>
              {errors.identifierType && <FieldError>{errors.identifierType}</FieldError>}
            </Field>

            <Field>
              <label htmlFor="identifier">
                {form.identifierType === 'bvn' ? 'BVN' : form.identifierType === 'nin' ? 'NIN' : 'BVN/NIN'}
              </label>
              <input
                id="identifier"
                name="identifier"
                type="number"
                inputMode="numeric"
                value={form.identifier}
                onChange={handleIdentifierChange}
                placeholder="11-digit number"
                maxLength={11}
                required
                disabled={!form.identifierType}
              />
              {errors.identifier && <FieldError>{errors.identifier}</FieldError>}
            </Field>
          </StepContent>
        )}

        {currentStep === 3 && (
          <StepContent>
            <StepTitle>Take a Selfie</StepTitle>
            <StepDescription>We need a clear photo of your face to verify your identity</StepDescription>

            {errors.general && <GeneralError>{errors.general}</GeneralError>}

            {!form.selfie ? (
              <SelfieContainer>
                {!isCameraActive ? (
                  <SelfieOptions>
                    <SelfieButton onClick={(e: React.MouseEvent) => { e.preventDefault(); startCamera(); }}>
                      📷 Use Camera
                    </SelfieButton>
                    <SelfieButton onClick={(e: React.MouseEvent) => { e.preventDefault(); fileInputRef.current?.click(); }}>
                      📁 Upload Photo
                    </SelfieButton>
                    <HiddenFileInput
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                    />
                  </SelfieOptions>
                ) : (
                  <CameraContainer>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{ width: '100%', borderRadius: '4px' }}
                    />
                    <CameraControlsContainer>
                      <CaptureButton onClick={(e: React.MouseEvent) => { e.preventDefault(); capturePhoto(); }}>
                        ✓ Capture Photo
                      </CaptureButton>
                      <CancelButton onClick={(e: React.MouseEvent) => { e.preventDefault(); stopCamera(); }}>
                        ✕ Cancel
                      </CancelButton>
                    </CameraControlsContainer>
                  </CameraContainer>
                )}
                <canvas ref={canvasRef} style={{ display: 'none' }} />
              </SelfieContainer>
            ) : (
              <SelfiePreview>
                <PreviewLabel>Selfie Captured ✓</PreviewLabel>
                <PreviewImage src={form.selfie} alt="Captured selfie" />
                <ChangeButton
                  type="button"
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault()
                    setForm((prev) => ({ ...prev, selfie: '' }))
                    stopCamera()
                  }}
                >
                  Take Another Photo
                </ChangeButton>
              </SelfiePreview>
            )}

            {errors.selfie && <FieldError>{errors.selfie}</FieldError>}
          </StepContent>
        )}

        <ButtonContainer>
          <PrevButton
            type="button"
            onClick={handlePrevStep}
            disabled={currentStep === 1 || isLoading}
          >
            ← Previous
          </PrevButton>

          {currentStep < 3 ? (
            <NextButton
              type="button"
              onClick={handleNextStep}
              disabled={isLoading}
            >
              Next →
            </NextButton>
          ) : (
            <SubmitButtonStyled
              type="button"
              onClick={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? 'Creating account...' : 'Create Account'}
            </SubmitButtonStyled>
          )}
        </ButtonContainer>

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
  gap: 24px;
  width: 100%;
`

const Header = styled.div`
  h1 {
    color: brown;
    font-size: 2rem;
    margin: 0 0 8px 0;
  }

  p {
    color: darkgrey;
    margin: 0 0 12px 0;
    font-size: 0.95rem;
    line-height: 1.4;
  }
`

const StepIndicator = styled.div`
  font-size: 0.85rem;
  color: #999;
  font-weight: 600;
`

const StepContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const StepTitle = styled.h2`
  color: brown;
  font-size: 1.3rem;
  margin: 0;
`

const StepDescription = styled.p`
  color: darkgrey;
  margin: 0;
  font-size: 0.9rem;
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;

  label {
    font-weight: 600;
    color: brown;
    font-size: 0.95rem;
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
      background-color: #f5f5f5;
      color: #999;
      cursor: not-allowed;
    }
  }

  select {
    appearance: none;
    background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='brown' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
    background-repeat: no-repeat;
    background-position: right 8px center;
    background-size: 24px;
    padding-right: 36px;
  }
`

const FieldError = styled.span`
  color: crimson;
  font-size: 0.85rem;
  font-weight: 500;
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

const SelfieContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const SelfieOptions = styled.div`
  display: flex;
  gap: 12px;
  flex-direction: column;
`

const SelfieButton = styled.button`
  height: 50px;
  border: 2px dashed brown;
  background-color: transparent;
  color: brown;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  type: button;

  &:hover {
    background-color: #faf8f6;
  }

  &:active {
    transform: scale(0.98);
  }
`

const HiddenFileInput = styled.input`
  display: none;
`

const CameraContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  background-color: #000;
  border-radius: 4px;
  overflow: hidden;
`

const CameraControlsContainer = styled.div`
  display: flex;
  gap: 12px;
  padding: 12px;
  background-color: #f9f9f9;
`

const CaptureButton = styled.button`
  flex: 1;
  height: 44px;
  background-color: #8B4513;
  color: cornsilk;
  border: none;
  border-radius: 4px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #654321;
  }
`

const CancelButton = styled.button`
  flex: 1;
  height: 44px;
  background-color: transparent;
  color: #8B4513;
  border: 1px solid #8B4513;
  border-radius: 4px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: #faf8f6;
  }
`

const SelfiePreview = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
`

const PreviewLabel = styled.p`
  color: #8B4513;
  font-weight: 600;
  margin: 0;
`

const PreviewImage = styled.img`
  width: 100%;
  max-width: 300px;
  height: auto;
  border-radius: 4px;
  border: 1px solid #ddd;
`

const ChangeButton = styled.button`
  height: 44px;
  background-color: transparent;
  color: #8B4513;
  border: 1px solid #8B4513;
  border-radius: 4px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: #faf8f6;
  }
`

const ButtonContainer = styled.div`
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-top: 12px;
`

const PrevButton = styled.button`
  flex: 1;
  height: 50px;
  border: 1px solid brown;
  background-color: transparent;
  color: brown;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background-color: #faf8f6;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const NextButton = styled.button`
  flex: 1;
  height: 50px;
  border: none;
  background-color: brown;
  color: cornsilk;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background-color: #8b6f47;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const SubmitButtonStyled = styled.button`
  flex: 1;
  height: 50px;
  border: none;
  border-radius: 4px;
  background-color: brown;
  color: cornsilk;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

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
  margin: 16px 0 0 0;

  a {
    color: brown;
    font-weight: 600;
  }
`

export default Page
