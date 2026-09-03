'use client'

import React, { useRef, useState } from 'react'
import styled from 'styled-components'
import { Camera, AlertCircle, CheckCircle, Loader } from 'lucide-react'
import { useAuth } from '@/app/providers/AuthProvider'

type VerificationStep = 1 | 2 | 3 | 4

const Container = styled.div`
  max-width: 600px;
  margin: 40px auto;
  padding: 0 16px;
`

const Header = styled.div`
  text-align: center;
  margin-bottom: 32px;

  h1 {
    color: brown;
    font-size: 2rem;
    margin: 0 0 8px;
  }

  p {
    color: darkgrey;
    margin: 0;
    line-height: 1.6;
  }
`

const FormCard = styled.div`
  background-color: antiquewhite;
  border-radius: 4px;
  border: 2px dashed brown;
  padding: 32px;
`

const AlertBox = styled.div<{ variant: 'info' | 'success' | 'error' }>`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 4px;
  margin-bottom: 24px;
  background-color: ${(p) =>
    p.variant === 'info'
      ? '#f0f9ff'
      : p.variant === 'success'
        ? '#e8f5e9'
        : '#ffebee'};
  border: 1px solid
    ${(p) =>
      p.variant === 'info'
        ? '#0284c7'
        : p.variant === 'success'
          ? 'darkgreen'
          : 'crimson'};
  color: ${(p) =>
    p.variant === 'info'
      ? '#0284c7'
      : p.variant === 'success'
        ? 'darkgreen'
        : 'crimson'};

  svg {
    flex-shrink: 0;
    margin-top: 2px;
  }
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

const Label = styled.label`
  font-weight: 600;
  color: brown;
  font-size: 0.95rem;
`

const FileInputWrapper = styled.div`
  position: relative;

  input[type='file'] {
    display: none;
  }
`

const FileInputButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 16px;
  border-radius: 4px;
  background: cornsilk;
  cursor: pointer;
  font-size: 0.95rem;
  color: brown;
  transition: all 0.2s;
  font-weight: 500;

  &:hover:not(:disabled) {
    background: #fff8f0;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const UploadedImageContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: #f5f1eb;
  border: 1px solid brown;
  border-radius: 4px;
  align-items: center;
`

const PreviewImage = styled.img`
  max-width: 100%;
  max-height: 300px;
  border-radius: 4px;
  border: 1px solid brown;
`

const VideoContainer = styled.div`
  position: relative;
  border-radius: 4px;
  overflow: hidden;
  background: #1a1a1a;
  aspect-ratio: 4 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid brown;
`

const Video = styled.video`
  width: 100%;
  height: 100%;
  object-fit: cover;
`

const CameraPlaceholder = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #999;
  padding: 40px 20px;
  text-align: center;

  svg {
    width: 48px;
    height: 48px;
    opacity: 0.5;
  }
`

const Canvas = styled.canvas`
  display: none;
`

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 24px;

  button {
    flex: 1;
  }
`

const Button = styled.button<{ variant?: 'primary' | 'secondary'; disabled?: boolean }>`
  padding: 12px 24px;
  border: none;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 50px;

  ${(p) =>
    p.variant === 'secondary'
      ? `
    background: cornsilk;
    color: brown;
    border: 1px solid brown;

    &:hover:not(:disabled) {
      background: #fff8f0;
    }
  `
      : `
    background: brown;
    color: cornsilk;

    &:hover:not(:disabled) {
      opacity: 0.85;
    }
  `}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const CameraButtonGroup = styled.div`
  display: flex;
  gap: 12px;

  button {
    flex: 1;
  }
`

const PreviewItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;

  small {
    font-size: 0.75rem;
    color: brown;
    font-weight: 600;
    text-transform: uppercase;
  }

  img {
    max-width: 100%;
    max-height: 150px;
    border-radius: 4px;
    border: 1px solid brown;
  }
`

type RegisterDriverProps = {
  onSuccess?: () => void
  onCancel?: () => void
}

export function RegisterDriver({ onSuccess, onCancel }: RegisterDriverProps) {
  const { setUser, token } = useAuth()
  const [step, setStep] = useState<VerificationStep>(1)
  const [driverLicense, setDriverLicense] = useState<string | null>(null)
  const [selfie, setSelfie] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCameraActive, setIsCameraActive] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const handleLicenseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      setDriverLicense(base64)
    }
    reader.onerror = () => {
      setError('Failed to read file. Please try again.')
    }
    reader.readAsDataURL(file)
  }

  const startVideoCapture = async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setIsCameraActive(true)
    } catch (err) {
      setError(
        'Unable to access camera. Please check your browser permissions.',
      )
      console.error('Camera access error:', err)
    }
  }

  const stopVideoCapture = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsCameraActive(false)
  }

  const captureSelfie = () => {
    if (!videoRef.current || !canvasRef.current) return

    const context = canvasRef.current.getContext('2d')
    if (!context) return

    canvasRef.current.width = videoRef.current.videoWidth
    canvasRef.current.height = videoRef.current.videoHeight
    context.drawImage(videoRef.current, 0, 0)

    const base64 = canvasRef.current.toDataURL('image/jpeg', 0.95)
    setSelfie(base64)
    stopVideoCapture()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!driverLicense || !selfie) {
      setError('Please complete both driver license and selfie capture')
      return
    }

    setIsLoading(true)
    setStep(3)
    setError(null)

    try {
      const response = await fetch('/api/v1/users/verify_rider', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ driverLicense, selfie }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error?.message || 'Verification failed. Please try again.')
      }

      if (!data.verified) {
        throw new Error(
          'Verification failed. Please ensure the selfie matches your driver license and try again.',
        )
      }

      // Update user state with verified status
      setUser(data.user)

      setStep(4)

      // Call onSuccess callback after a delay
      setTimeout(() => {
        onSuccess?.()
      }, 2000)
    } catch (err) {
      setStep(2)
      setError(
        err instanceof Error ? err.message : 'Verification failed. Please try again.',
      )
      setIsLoading(false)
    }
  }

  const handleNext = () => {
    if (step === 1 && !driverLicense) return
    if (step === 2 && !selfie) return
    if (step === 3) return
    
    if (step < 4) {
      setStep((prev) => (prev + 1) as VerificationStep)
    }
  }

  const handlePrev = () => {
    if (step > 1) {
      setStep((prev) => (prev - 1) as VerificationStep)
    }
  }

  const handleChangeImage = () => {
    setDriverLicense(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleRetakeSelfie = () => {
    setSelfie(null)
    startVideoCapture()
  }

  if (step === 4) {
    return (
      <Container>
        <FormCard>
          <AlertBox variant="success">
            <CheckCircle size={20} />
            <div>
              <strong>Verification Successful!</strong>
              <p>You are now verified as a driver. Redirecting...</p>
            </div>
          </AlertBox>
        </FormCard>
      </Container>
    )
  }

  return (
    <Container>
      {/* Hidden canvas used to snapshot a frame from the video stream */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <Header>
        <h1>Complete Driver Verification</h1>
        <p>
          To offer rides or list cars for rental, you need to be verified as a
          driver. Please upload your driver&apos;s license and take a selfie to
          continue.
        </p>
      </Header>

      <FormCard>
        {error && (
          <AlertBox variant="error">
            <AlertCircle size={20} />
            <div>{error}</div>
          </AlertBox>
        )}

        <Form onSubmit={handleSubmit}>
          {step === 1 && (
            <FormSection>
              <SectionTitle>Step 1: Upload Driver&apos;s License</SectionTitle>
              <AlertBox variant="info">
                <AlertCircle size={16} />
                <div>Please upload a clear photo of your driver&apos;s license</div>
              </AlertBox>

              {!driverLicense ? (
                <FileInputWrapper>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLicenseUpload}
                    disabled={isLoading}
                  />
                  <FileInputButton
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                  >
                    📄 Click to upload driver&apos;s license or drag and drop
                  </FileInputButton>
                </FileInputWrapper>
              ) : (
                <UploadedImageContainer>
                  <AlertBox variant="success">
                    <CheckCircle size={16} />
                    <div>Driver&apos;s license uploaded successfully</div>
                  </AlertBox>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleChangeImage}
                    disabled={isLoading}
                  >
                    Change Image
                  </Button>
                </UploadedImageContainer>
              )}
            </FormSection>
          )}

          {step === 2 && (
            <FormSection>
              <SectionTitle>Step 2: Capture Selfie</SectionTitle>
              <AlertBox variant="info">
                <AlertCircle size={16} />
                <div>
                  Position your face clearly in the frame. This helps verify you are the license holder.
                </div>
              </AlertBox>

              <VideoContainer>
                {/* Always mounted so videoRef is available before isCameraActive is set */}
                <Video ref={videoRef} style={{ display: isCameraActive ? 'block' : 'none' }} />
                {!isCameraActive && (selfie ? (
                  <Video as="img" src={selfie} alt="Captured selfie" />
                ) : (
                  <CameraPlaceholder>
                    <Camera />
                    <div>Take a selfie image</div>
                  </CameraPlaceholder>
                ))}
              </VideoContainer>

              {isCameraActive && (
                <CameraButtonGroup>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={captureSelfie}
                    disabled={isLoading}
                  >
                    <Camera size={18} /> Capture Selfie
                  </Button>
                </CameraButtonGroup>
              )}

              {!isCameraActive && !selfie && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={startVideoCapture}
                  disabled={isLoading}
                >
                  📹 Start Camera
                </Button>
              )}

              {selfie && (
                <UploadedImageContainer>
                  <AlertBox variant="success">
                    <CheckCircle size={16} />
                    <div>Selfie captured successfully</div>
                  </AlertBox>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleRetakeSelfie}
                    disabled={isLoading}
                  >
                    Retake Selfie
                  </Button>
                </UploadedImageContainer>
              )}
            </FormSection>
          )}

          {step === 3 && (
            <FormSection>
              <AlertBox variant="info">
                <Loader size={20} className="animate-spin" />
                <div>
                  <strong>Verifying your information...</strong>
                  <p>
                    This may take a moment. Please do not close this window.
                  </p>
                </div>
              </AlertBox>
            </FormSection>
          )}
        </Form>

        {step < 4 && (
          <ButtonGroup>
            <Button
              type="button"
              variant="secondary"
              onClick={handlePrev}
              disabled={step === 1 || isLoading}
            >
              ← Previous
            </Button>
            {step === 1 && (
              <Button
                type="button"
                variant="primary"
                onClick={handleNext}
                disabled={!driverLicense || isLoading}
              >
                Next →
              </Button>
            )}
            {step === 2 && driverLicense && selfie && (
              <Button
                type="submit"
                variant="primary"
                disabled={isLoading}
                onClick={handleSubmit}
              >
                {isLoading && <Loader size={16} className="animate-spin" />}
                {isLoading ? 'Verifying...' : 'Submit Verification'}
              </Button>
            )}
          </ButtonGroup>
        )}
      </FormCard>
    </Container>
  )
}
