# Jekalo API

Backend API for Jekalo — a ride-hailing and vehicle rental platform with integrated payments via Paystack.

## Tech Stack

- **Runtime** — Node.js (ESM)
- **Framework** — Express 5
- **Database** — PostgreSQL 17 + PostGIS (geometry for locations)
- **ORM** — Drizzle ORM
- **Payments** — Paystack (transactions, transfers, webhooks)
- **Auth** — JWT (HS256, 1-hour expiry)
- **Validation** — Zod v4
- **Testing** — Node.js built-in test runner

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 17+ with PostGIS extension
- A Paystack test/live secret key

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Start Postgres (via Docker)
cp docker-compose.example.yml docker-compose.yml
# Edit docker-compose.yml with your credentials, then:
docker compose up -d

# 3. Configure environment
cp .env.example .env
# Edit .env with your database URL, JWT secret, and Paystack key

# 4. Run migrations
npm run db:migrate

# 5. Start the server
npm run dev
```

The server starts on `http://localhost:3000` by default. On boot, it syncs the Nigerian bank list from Paystack.

### Scripts

| Command | Description |
|---|---|
| `npm start` | Start production server |
| `npm run dev` | Start with file watching |
| `npm run db:generate` | Generate a new Drizzle migration |
| `npm run db:migrate` | Apply pending migrations |
| `npm test` | Run all test suites |

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | No | `jekalo-dev-secret` | Secret for signing JWT tokens |
| `PAYSTACK_SECRET_KEY` | Yes | — | Paystack API secret key |
| `PORT` | No | `3000` | Server port |
| `HOLD_EXPIRY_MINUTES` | No | `5` | Minutes before unpaid booking holds expire (1-10) |
| `SWEEP_INTERVAL_MINUTES` | No | `1` | How often the hold sweeper runs (1-15 min) |
| `PAYSTACK_BASE_URL` | No | `https://api.paystack.co` | Override for Paystack API base URL |

## Database Schema

### ER Diagram (Tables)

```
users
├── vehicles (driver_id → users.id)
├── bank_accounts (user_id → users.id, UNIQUE)
├── ride_bookings (passenger_id → users.id)
├── rental_bookings (renter_id → users.id)
├── rental_listings (owner_id → users.id)
└── payments (user_id → users.id)

rides
├── ride_bookings (ride_id → rides.id)
└── vehicles (vehicle_id → vehicles.id)

rental_listings
├── rental_bookings (listing_id → rental_listings.id)
└── vehicles (vehicle_id → vehicles.id)

payments
├── ledger_entries (payment_id → payments.id)
├── ride_bookings (ride_booking_id → ride_bookings.id)
└── rental_bookings (rental_booking_id → rental_bookings.id)

banks
└── bank_accounts (bank_code → banks.code)
```

### Key Design Decisions

- **All monetary values are integers in kobo** (smallest unit). Stored as `bigint` in Postgres, sent as integers in API payloads and Paystack requests.
- **Append-only ledger** — `ledger_entries` rows are never deleted or mutated for completed entries. Corrections are new entries (reversals, adjustments).
- **Idempotent webhook processing** — `gateway_reference` unique constraint on ledger entries prevents duplicate settlements from concurrent webhook/verify calls.
- **Partial unique index on ride bookings** — allows only one *active* hold per passenger per ride, but permits re-booking after cancellation or expiry.
- **Bank account numbers are masked at rest** — plain numbers are only used transiently for Paystack API calls. Stored as `******7890` in the database.
- **1 bank account per user** — enforced via a unique constraint on `user_id`.

## API Reference

All routes are prefixed with `/api/v1`. Responses follow a consistent shape:

```json
// Success (200/201)
{ "id": "...", "field": "value" }

// Error (4xx/5xx)
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description.",
    "details": { "field": "Specific issue" }
  }
}
```

### Authentication

JWT Bearer token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Obtain a token via `POST /users/login`.

---

### Users — `/api/v1/users`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/register` | No | Create a new account |
| `POST` | `/login` | No | Authenticate (email or phone + password) |
| `GET` | `/profile/me` | Yes | Get current user profile |
| `PUT` | `/profile/me` | Yes | Update current user profile |
| `DELETE` | `/profile/me` | Yes | Delete current user account |

---

### Vehicles — `/api/v1/vehicles`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/` | Yes | Register a vehicle |
| `GET` | `/` | Yes | List current user's vehicles |
| `GET` | `/:id` | Yes | Get a specific vehicle |
| `PATCH` | `/:id` | Yes | Update vehicle details |
| `DELETE` | `/:id` | Yes | Remove a vehicle |

---

### Rides — `/api/v1/rides`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/` | Yes | Create a ride offer |
| `GET` | `/` | Yes | List current user's rides |
| `GET` | `/search` | Yes | Search nearby rides (PostGIS radius) |
| `GET` | `/bookings/mine` | Yes | List current user's ride bookings |
| `GET` | `/:id` | Yes | Get a specific ride |
| `POST` | `/:id/bookings` | Yes | Book seats on a ride (holds seats, starts payment) |
| `GET` | `/:id/passengers` | Yes | List passengers for a ride |
| `PATCH` | `/:id/bookings/mine` | Yes | Update booking (seat count) |
| `DELETE` | `/:id/bookings/mine` | Yes | Cancel a booking |
| `PATCH` | `/:id/start` | Yes | Mark ride as started (PENDING → STARTED) |
| `PATCH` | `/:id/complete` | Yes | Complete ride + trigger driver payout |
| `PATCH` | `/:id/cancel` | Yes | Cancel ride (releases any active holds) |

---

### Rentals — `/api/v1/rentals`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/listings` | Yes | Create a rental listing |
| `GET` | `/listings` | Yes | List current user's listings |
| `GET` | `/listings/search` | Yes | Search rental listings |
| `GET` | `/listings/:id` | Yes | Get a specific listing |
| `PUT` | `/listings/:id` | Yes | Update a listing |
| `DELETE` | `/listings/:id` | Yes | Delete a listing |
| `POST` | `/listings/:id/bookings` | Yes | Book a listing (holds dates, starts payment) |

---

### Payments — `/api/v1/payments`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/webhook` | No* | Paystack webhook receiver (HMAC verified) |
| `GET` | `/` | Yes | List current user's payments |
| `GET` | `/verify/:reference` | Yes | Verify a payment with Paystack |

*\*Webhook is publicly accessible but verifies `x-paystack-signature`.*

---

### Bank Accounts — `/api/v1/bank-accounts`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/banks` | Yes | List available Nigerian banks |
| `POST` | `/resolve` | Yes | Validate an account number via Paystack |
| `POST` | `/` | Yes | Add a bank account (1 per user) |
| `GET` | `/` | Yes | Get current user's bank account |
| `PATCH` | `/` | Yes | Update bank account (both fields required) |
| `DELETE` | `/` | Yes | Remove bank account |

Account numbers are masked at rest (`******7890`). The full number is only used transiently for Paystack API calls. The Paystack transfer recipient code (`RCP_xxx`) is stored and used for automatic driver payout when a ride is completed.

---

### Addresses — `/api/v1/addresses`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/autocomplete` | Yes | Google Places address autocomplete |

## Architecture

```
index.js                    # Express app, route mounting, boot sequence
├── routes/                 # Express routers (one per resource)
│   ├── users.js
│   ├── vehicles.js
│   ├── rides.js
│   ├── rentals.js
│   ├── payments.js
│   ├── bank_accounts.js
│   └── addresses.js
├── services/               # Business logic + external API calls
│   ├── payments.service.js     # Paystack transaction/refund/payout logic
│   ├── bank_accounts.service.js # Paystack bank resolve + recipient creation
│   ├── banks.service.js        # Bank list sync from Paystack
│   ├── rides.service.js        # Ride booking orchestration
│   ├── rentals.service.js      # Rental booking orchestration
│   └── holds.service.js        # Background sweeper for expired holds
├── db/                     # Drizzle schema + repositories
│   ├── schema.js              # Table definitions, enums, constraints
│   ├── index.js               # Drizzle instance + pool
│   ├── users.repo.js
│   ├── vehicle.repo.js
│   ├── rides.repo.js
│   ├── ride_bookings.repo.js
│   ├── rental_listings.repo.js
│   ├── rental_bookings.repo.js
│   ├── payments.repo.js
│   ├── ledger.repo.js
│   ├── banks.repo.js
│   └── bank_accounts.repo.js
├── middleware/
│   ├── requireAuth.js         # JWT verification
│   └── validate.js            # Zod body validation
├── utils/
│   ├── paystack.js            # Shared Paystack HTTP client + error class
│   ├── money.js               # Platform fee computation (1%)
│   ├── env.js                 # Environment validation (Zod)
│   ├── serializers.js         # API response shaping
│   └── pagination.js          # Pagination helpers
├── validationSchemas/         # Zod request schemas
│   ├── users.js
│   ├── vehicles.js
│   ├── rides.js
│   ├── rentals.js
│   └── bank_accounts.js
└── tests/                     # Integration tests (Node test runner)
    ├── helpers.js
    ├── users.test.js
    ├── vehicles.test.js
    ├── rides.test.js
    ├── payments.test.js
    └── bank_accounts.test.js
```

## Payment Flow

### Ride Booking

```
1. POST /rides/:id/bookings
   → hold seats (active status)
   → create pending payment
   → initialize Paystack checkout
   → return authorization URL

2. User pays on Paystack checkout page

3. POST /payments/webhook (charge.success)
   → settle payment (status → success)
   → record credit ledger entry
   → confirm booking (active → confirmed)

4. PATCH /rides/:id/complete
   → mark ride as completed
   → for each successful payment:
       → look up driver's bank account + Paystack recipient code
       → compute payout (amount - 1% platform fee)
       → create Paystack transfer
       → record debit ledger entry (idempotent via gateway_reference)
```

### Rental Booking

```
1. POST /rentals/listings/:id/bookings
   → hold dates (confirmed status)
   → create pending payment
   → initialize Paystack checkout
   → return authorization URL

2. User pays on Paystack checkout page

3. POST /payments/webhook (charge.success)
   → settle payment
   → record credit ledger entry
```

## Testing

Tests use Node.js built-in test runner with a real PostgreSQL database. Each test file:
- Spins up an Express server on a random port
- Stubs Paystack API calls via `globalThis.fetch` interception
- Cleans up test data before/after all tests

```bash
# Run all tests
npm test

# Run a specific test file
node --test tests/bank_accounts.test.js
```

## License

ISC
