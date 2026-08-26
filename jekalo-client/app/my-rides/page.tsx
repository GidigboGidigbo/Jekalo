'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import styled from 'styled-components'
import { Car, Users } from 'lucide-react'

type RideStatus = 'PENDING' | 'STARTED' | 'COMPLETED' | 'CANCELLED'

type OfferedRide = {
  id: string
  fromAddress: string
  toAddress: string
  pickupDate: string
  pickupTime: string
  price: string
  status: RideStatus
}

type BookedRide = {
  id: string
  seatsBooked: number
  fromAddress: string
  toAddress: string
  pickupDate: string
  pickupTime: string
  price: string
  status: RideStatus
}

// TODO: wire up to GET /api/v1/rides (offered rides) and
// GET /api/v1/rides/bookings/mine (booked rides) once the client has
// auth/session handling in place. Both endpoints already exist server-side.
const INITIAL_OFFERED_RIDES: OfferedRide[] = []
const INITIAL_BOOKED_RIDES: BookedRide[] = []

function Page() {
  const [offeredRides] = useState<OfferedRide[]>(INITIAL_OFFERED_RIDES)
  const [bookedRides] = useState<BookedRide[]>(INITIAL_BOOKED_RIDES)

  const hasNoRides = offeredRides.length === 0 && bookedRides.length === 0

  return (
    <Wrapper>
      <h1>My Rides</h1>

      {hasNoRides ? (
        <EmptyState>
          <p>You haven&apos;t taken or offered any rides yet.</p>
          <ActionRow>
            <ActionButton href="/book-ride">
              <Car size={20} strokeWidth={1.5} />
              Book a ride
            </ActionButton>
            <ActionButton href="/offer-ride">
              <Users size={20} strokeWidth={1.5} />
              Offer a ride
            </ActionButton>
          </ActionRow>
        </EmptyState>
      ) : (
        <>
          <Section>
            <h2>Rides you&apos;re taking</h2>
            {bookedRides.length === 0 ? (
              <SectionEmptyState>
                <p>You haven&apos;t booked a ride yet.</p>
                <ActionButton href="/book-ride">
                  <Car size={20} strokeWidth={1.5} />
                  Book a ride
                </ActionButton>
              </SectionEmptyState>
            ) : (
              <RideList>
                {bookedRides.map((ride) => (
                  <RideCard key={ride.id}>
                    <RideRoute>
                      <span>{ride.fromAddress}</span>
                      <span>&rarr;</span>
                      <span>{ride.toAddress}</span>
                    </RideRoute>
                    <RideMeta>
                      <span>{ride.pickupDate} &middot; {ride.pickupTime}</span>
                      <span>{ride.seatsBooked} seat{ride.seatsBooked === 1 ? '' : 's'}</span>
                      <StatusBadge $status={ride.status}>{ride.status}</StatusBadge>
                    </RideMeta>
                  </RideCard>
                ))}
              </RideList>
            )}
          </Section>

          <Section>
            <h2>Rides you&apos;re offering</h2>
            {offeredRides.length === 0 ? (
              <SectionEmptyState>
                <p>You haven&apos;t offered a ride yet.</p>
                <ActionButton href="/offer-ride">
                  <Users size={20} strokeWidth={1.5} />
                  Offer a ride
                </ActionButton>
              </SectionEmptyState>
            ) : (
              <RideList>
                {offeredRides.map((ride) => (
                  <RideCard key={ride.id}>
                    <RideRoute>
                      <span>{ride.fromAddress}</span>
                      <span>&rarr;</span>
                      <span>{ride.toAddress}</span>
                    </RideRoute>
                    <RideMeta>
                      <span>{ride.pickupDate} &middot; {ride.pickupTime}</span>
                      <StatusBadge $status={ride.status}>{ride.status}</StatusBadge>
                    </RideMeta>
                  </RideCard>
                ))}
              </RideList>
            )}
          </Section>
        </>
      )}
    </Wrapper>
  )
}

const Wrapper = styled.div`
  max-width: 720px;
  margin: 0 auto;
  padding: 48px 16px;

  h1 {
    color: brown;
    font-size: 2rem;
    margin: 0 0 24px;
  }
`

const Section = styled.section`
  margin-bottom: 32px;

  h2 {
    color: brown;
    font-size: 1.25rem;
    margin: 0 0 12px;
  }
`

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 48px 16px;
  background-color: antiquewhite;
  border-radius: 4px;
  border: 2px dashed brown;
  text-align: center;

  p {
    color: brown;
    font-weight: 600;
    margin: 0;
  }
`

const SectionEmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 24px;
  background-color: antiquewhite;
  border-radius: 4px;
  border: 2px dashed brown;

  p {
    color: brown;
    margin: 0;
  }
`

const ActionRow = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
`

const ActionButton = styled(Link)`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
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

const RideList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const RideCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background-color: antiquewhite;
  border-radius: 4px;
  border: 2px dashed brown;
`

const RideRoute = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: brown;
  font-weight: 600;
`

const RideMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  color: darkgrey;
  font-size: 0.9rem;
`

const STATUS_COLORS: Record<RideStatus, string> = {
  PENDING: '#B87C4C',
  STARTED: 'brown',
  COMPLETED: 'darkgreen',
  CANCELLED: 'crimson',
}

const StatusBadge = styled.span<{ $status: RideStatus }>`
  padding: 2px 8px;
  border-radius: 4px;
  color: cornsilk;
  font-size: 0.75rem;
  font-weight: 700;
  background-color: ${(props: { $status: RideStatus }) => STATUS_COLORS[props.$status]};
`

export default Page