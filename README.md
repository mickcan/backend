# Coworking Booking Space – Backend API

Node.js/Express API server for a coworking space booking platform. Provides authentication (user/admin), room management, booking system with recurring reservations, Stripe/PayPal payments, invoice generation, and scheduled tasks. Uses MongoDB, JWT, Cloudinary for images, and email notifications.

## Quick start

Prerequisites:

- Node.js 18+ (20+ recommended)
- MongoDB instance (local or cloud)
- Stripe account (for payments)
- Cloudinary account (for image uploads)
- Email provider with SMTP (Gmail recommended)

Install and run:

```powershell
npm install
Copy-Item .env.example .env
# Edit .env with your configuration
npm run dev
```

Server runs on http://localhost:3000 by default with nodemon for auto-restart.

## Scripts

- `npm run dev` – start with nodemon (development)
- `npm test` – placeholder (no tests configured)

## Environment variables

Copy `.env.example` to `.env` and configure:

```bash
# Server
PORT=3000
NODE_ENV=development

# Database
MONGO_URI=mongodb://localhost:27017/coworking-booking

# Authentication
JWT_SECRET=your_super_secret_jwt_key_here

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# PayPal
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_secret
PAYPAL_SANDBOX=true

# Cloudinary (image uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Email (SMTP)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# Frontend URLs
BASE_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3001
```

**Important**: Never commit real credentials to version control.

## Tech stack

- **Runtime**: Node.js with ES modules
- **Framework**: Express 5
- **Database**: MongoDB with Mongoose 8
- **Authentication**: JWT with bcryptjs
- **Payments**: Stripe, PayPal
- **File uploads**: Multer + Cloudinary
- **Email**: Nodemailer
- **Scheduling**: node-cron
- **Utilities**: date-fns, cookie-parser, cors

## Project structure

```
├── config/           # Database and service configurations
├── controllers/      # Route handlers and business logic
├── middleware/       # Authentication, file upload, validation
├── models/          # MongoDB schemas (User, Room, Booking, etc.)
├── routes/          # API endpoint definitions
├── services/        # External service integrations
├── utils/           # Helper functions and scheduled tasks
├── uploads/         # Local file storage (dev only)
├── scripts/         # Database seeders and utilities
└── seeders/         # Initial data setup
```

## Core models

### User

- Authentication (user/admin roles)
- Status: pending/active
- Email invitations system

### Room

- Multiple images via Cloudinary
- Pricing by time slot (morning/afternoon/night)
- Capacity and amenities

### Booking

- Time slot based scheduling
- Payment integration (Stripe/PayPal)
- Status tracking (upcoming/completed/cancelled)
- Recurring booking support

### Invoice

- Automated billing for recurring bookings
- Integration with Stripe invoicing

## API endpoints

### Authentication (`/api/auth`)

```
POST   /login                    # User login
POST   /admin/login             # Admin login
POST   /register/:token         # Register with invite token
POST   /forgot-password         # Password reset request
POST   /reset-password/:token   # Complete password reset
POST   /logout                  # Logout (clear tokens)
```

### Admin (`/api/admin`)

```
POST   /invite                  # Invite new user
GET    /users                   # Get all users
GET    /users/:userId/bookings  # Get user's bookings
PUT    /users/:id              # Update user
DELETE /users/:id              # Delete user
GET    /bookings               # Get all bookings
PATCH  /bookings/:bookingId/cancel    # Cancel any booking
DELETE /bookings/:bookingId           # Delete booking
POST   /change-admin           # Change admin user
```

### Rooms (`/api/rooms`)

```
GET    /                       # Get all rooms
GET    /available              # Get available rooms by time slot
GET    /:id                    # Get room details
POST   /                       # Create room (admin)
PUT    /:id                    # Update room (admin)
DELETE /:id                    # Delete room (admin)
```

### Users (`/api/users`)

```
GET    /me                             # Get current user's profile
GET    /admin/users                    # List users (admin)
GET    /admin/users/:id                # Get user by ID (admin)
PUT    /admin/users/:id                # Update user (admin)
PATCH  /admin/users/:id/toggle         # Activate/deactivate user (admin)
DELETE /admin/users/:id                # Delete user (admin)
```

### Bookings (`/api/bookings`)

```
POST   /                       # Create booking
GET    /my-bookings           # Get user's bookings
GET    /check-booked-rooms    # Check room availability
GET    /:id                   # Get booking details
GET    /room/:roomId          # Get room's bookings
PATCH  /:id/cancel           # Cancel booking
```

### Recurring bookings (`/api/recurring-bookings`)

```
# Modal helper endpoints used by admin recurring reservation UI
GET    /modal/users                      # List users for selection
GET    /modal/time-slots                 # Time slot options
POST   /modal/available-rooms            # Available rooms by constraints

# Group operations
POST   /modal/recurring-group            # Create recurring booking group
POST   /cancel-recurring-group           # Cancel a recurring group
POST   /delete-recurring-group           # Hard delete a recurring group

# Single recurring booking
POST   /recurring                        # Create a recurring booking

# Utilities (admin protected)
GET    /availability                     # Check availability (admin)
GET    /test                             # Test endpoint (admin)
```

Controllers:

- Group and modal flows are implemented in `controllers/recurringModalController.js` (create/cancel/delete recurring groups, time-slots, available rooms helpers).
- Additional endpoints (e.g., availability checks) live in `controllers/recurringBookingController.js`.

### Payments (`/api/payments`)

```
POST   /create-checkout-session        # Stripe one-time payment
POST   /create-subscription-checkout-session  # Stripe subscription
POST   /create-card-setup-session     # Save card for later billing
POST   /create-paypal-order           # PayPal payment
POST   /paypal-capture               # Complete PayPal payment
GET    /sessions/:sessionId          # Get payment session details
POST   /sessions/:sessionId/save-booking      # Save booking after payment
POST   /sessions/:sessionId/save-card-booking # Save booking after card setup
POST   /webhook                      # Stripe webhook handler

# Subscription management
GET    /subscriptions/:userId                   # List user subscriptions
PUT    /subscriptions/:subscriptionId/cancel    # Cancel a subscription
POST   /subscriptions/:subscriptionId/bookings  # Add a booking to a subscription
```

Additionally, Stripe webhooks are also handled at:

```
POST   /api/stripe/payments/webhook
```

### Weekdays (`/api/weekdays`)

```
GET    /                                  # Get weekday time slots
POST   /available                         # Get available time slots with custom settings
```

### Settings (`/api/settings`)

```
GET    /                       # Get all settings
GET    /time-slots             # Get time slot configuration
POST   /time-slots             # Create/update time slots
PUT    /time-slots             # Update time slots
GET    /booking-rules          # Get booking rules
POST   /booking-rules          # Create/update booking rules
PUT    /booking-rules          # Update booking rules
```

### Dashboard (`/api/dashboard`)

```
GET    /                       # Get aggregated dashboard data (admin)
```

### Invoices (`/api/invoices`)

```
POST   /auto-create                         # Auto-create invoice for successful payment
POST   /create                              # Create single invoice
POST   /send/:invoiceId                     # Send single invoice via email
POST   /bulk/create                         # Create bulk invoices
POST   /bulk/send                           # Send bulk invoices
GET    /                                    # List invoices with filters
GET    /stats/summary                       # Invoice summary stats
GET    /billing/users                       # Users billing data + booking summaries
GET    /booking/:bookingId                  # Get invoice for a specific booking
POST   /test-email                          # Test email delivery
POST   /send-booking/:userId/:bookingId     # Send invoice for a booking
GET    /:invoiceId                          # Get invoice by ID
DELETE /:invoiceId                          # Delete invoice
```

### Settings (`/api/settings`)

```
GET    /                       # Get all settings
PUT    /                       # Update settings
GET    /time-slots            # Get time slot configuration
PUT    /time-slots            # Update time slots
GET    /business-hours        # Get business hours
PUT    /business-hours        # Update business hours
```

### Dashboard (`/api/dashboard`)

```
GET    /stats                 # Get dashboard statistics
GET    /recent-bookings       # Get recent bookings
GET    /revenue               # Get revenue analytics
```

## Middleware

### Authentication

- `protect` – Verify JWT token
- `adminOnly` – Require admin role
- CORS configured for frontend origins

### File uploads

- Multer for multipart handling
- Cloudinary integration for image storage
- Local fallback in development

### Error handling

- Global error handler with environment-aware responses
- Request logging in development

## Scheduled tasks

The server runs automated tasks via node-cron:

- **Booking status updates**: Mark past bookings as completed
- **Invoice generation**: Create monthly invoices for recurring bookings
- **Email notifications**: Send booking reminders and confirmations

Initialization:

- General scheduled tasks are initialized via `utils/scheduleTasks.js`.
- Recurring booking cron jobs are scheduled via `setupRecurringBookingCronJobs()` from `controllers/recurringModalController.js`.
- Both are invoked in `server.js` after the server starts listening.

Recurring cron jobs:

- `scheduleNextMonthBookings` runs on the 1st of each month at 02:00 to create next month bookings.
- `createMonthlyInvoices` runs on the 16th of each month at 10:00 to generate Stripe invoices.

## Payment integration

### Stripe

- One-time payments via Checkout Sessions
- Subscription billing for recurring bookings
- Card setup for later charging (monthly invoices)
- Webhook handling for payment status updates

### PayPal

- Order creation and capture flow
- Sandbox/production environment support

### Stripe webhook setup (important)

Stripe requires a publicly reachable HTTPS endpoint for webhooks (you cannot register `localhost` in the Stripe Dashboard). Use your live/staging domain for production, and the Stripe CLI (or a tunnel like ngrok) for local development.

Endpoint in this server:

```
POST /api/stripe/payments/webhook
```

Events to enable for this endpoint:

- `invoice.paid`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

Steps (production):

1. In Stripe Dashboard → Developers → Webhooks → Add endpoint
2. Endpoint URL: `https://your-domain.com/api/stripe/payments/webhook`
3. Select events: invoice.paid, invoice.payment_succeeded, invoice.payment_failed
4. After creation, copy the Signing secret and set it in `.env` as `STRIPE_WEBHOOK_SECRET`
5. Deploy/restart the server

Local development options:

- Use Stripe CLI to forward events to your local server and get a temporary signing secret

```powershell
# Log in
stripe login

# Listen and forward only the needed events to your local server
stripe listen --events invoice.paid,invoice.payment_succeeded,invoice.payment_failed --forward-to http://localhost:3000/api/stripe/payments/webhook

# The CLI prints a webhook signing secret; set it temporarily in your .env:
# STRIPE_WEBHOOK_SECRET=whsec_XXXXXXXXXXXXXXXXXXXXXXXX
```

Notes:

- The route uses `express.raw({ type: 'application/json' })` and is mounted before `express.json()` in `server.js` (required by Stripe).
- Ensure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in `.env` match the environment (live vs test).
- There is an additional webhook at `POST /api/payments/webhook` for broader Stripe events; for invoice status updates use the endpoint above.

## Development workflow

1. **Setup database**: Ensure MongoDB is running
2. **Configure environment**: Copy and edit `.env`
3. **Create admin**: Run `node scripts/createAdmin.js`
4. **Start server**: `npm run dev`
5. **Seed data** (optional): Run seeder scripts for test rooms/bookings

## File uploads

- **Development**: Files stored in `uploads/rooms/`
- **Production**: Cloudinary handles all image storage
- Supported formats: Common image types (jpg, png, webp)
- Multi-image upload for room galleries

## Database seeding

Create initial admin user:

```powershell
node scripts/createAdmin.js
```

The script prompts for admin email and password, then creates the admin account.

## Security features

- JWT-based authentication with configurable expiration
- Password hashing with bcryptjs
- CORS protection with origin validation
- Admin-only routes protected by role-based middleware
- Input validation and sanitization

## Email notifications

Uses Nodemailer with Gmail SMTP:

- User invitation emails
- Booking confirmations
- Payment receipts
- Password reset links

## Deployment considerations

1. **Environment**: Set `NODE_ENV=production`
2. **Database**: Use MongoDB Atlas or dedicated instance
3. **Uploads**: Ensure Cloudinary is configured (no local storage)
4. **Secrets**: Rotate JWT_SECRET and API keys
5. **CORS**: Update allowed origins for production domains
6. **Webhooks**: Configure Stripe webhook endpoints
7. **Email**: Use production SMTP credentials

## Troubleshooting

**Database connection fails**: Check MongoDB URI and network access  
**JWT errors**: Verify JWT_SECRET is set and consistent across restarts  
**File uploads fail**: Confirm Cloudinary credentials and network access  
**Payment webhooks fail**: Check Stripe webhook secret and endpoint configuration  
**CORS errors**: Add frontend domain to allowedOrigins in server.js  
**Email not sending**: Verify SMTP credentials and Gmail app password

---

Part of the Coworking Booking Space platform. Frontend apps: Coworking-Booking-Space-FrontEnd (users), Coworking-Booking-Space-Admin (management).
