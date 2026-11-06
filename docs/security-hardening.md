# Security hardening

This document describes the security controls implemented in the application and the deployment steps still required. Use synthetic accounts and images while validating these changes.

## Implemented in the Node API

- Provider credentials and database access are read by the server. Roboflow inference and email delivery are server-to-server calls; the React app does not receive provider keys. The Textbee adapter remains commented out and inactive.
- `.env*` files are ignored by Git. Production secrets belong in the Render secret manager. The existing authentication design uses random opaque session tokens and stores only their SHA-256 hashes; it does not use JWTs or a `JWT_SECRET`.
- Patient passwords, verification codes, and reset codes use salted scrypt hashes. Password values are capped at 256 characters. Admin accounts require MFA in production.
- Patient and admin cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production. Sessions are stored server-side and expire after seven days without activity; a successful authenticated request refreshes the idle timeout.
- All `/api/admin/*` data routes require an active admin session and the `admin` role. A patient session attempting an admin API receives `403` with a generic permission message. Unauthenticated requests receive `401`.
- Patient portal data is selected through the authenticated account's linked patient record. Assessment listing, deletion, photo reads, appointments, messages, visits, medical history, notifications, and invoices are scoped to that linked record. Cross-account assessment/photo requests receive the same generic `403` response.
- Signup is limited to five account attempts per IP per hour. Login, MFA, password recovery, and email verification also have persistent rate limits. Emails and IP addresses used for throttling and security events are HMACed using the server-only `DATABASE_URL` as the key material.
- Security events record failed logins, rejected MFA attempts, rate limits, unauthenticated admin access, patient attempts to open admin APIs, and denied assessment access. Event rows contain hashed identifiers and route metadata, never passwords, codes, uploaded images, or message contents. The admin-only endpoint is `/api/admin/auth/security-events`; events older than 180 days are removed.
- Request JSON limits are enforced in bytes and non-object JSON is rejected. Assessment uploads enforce image MIME/signature agreement, per-file and per-assessment size limits, image dimension bounds, safe filenames, private storage permissions, and authenticated image reads. Stored paths are checked against traversal and symlink attacks.
- There are no inbound email, payment, notification, or AI webhooks in the current application. Email and Roboflow are outbound integrations, so there is no webhook endpoint that currently needs signature validation. If an inbound webhook is added, it must verify the provider signature over the raw request body before processing.
- Supabase RLS is enabled on application tables and direct `PUBLIC`, `anon`, and `authenticated` table/sequence grants are revoked, including defaults for future objects. Browser code must continue to use the Node API and must never receive the service role key or database URL.

## Database authorization boundary

The application uses its own password and session tables rather than Supabase Auth. Therefore Supabase `auth.uid()` is not available to express a meaningful per-patient SQL policy. RLS currently denies direct Data API access to browser roles; patient ownership is enforced by the authenticated Node API queries. The Render `DATABASE_URL` is a trusted server credential and may have RLS-bypass privileges, so RLS does not independently constrain a compromised backend connection.

Before production, use a dedicated PostgreSQL runtime role with only the required table privileges and `NOBYPASSRLS`, and either migrate identity to Supabase Auth or add transaction-scoped, verified identity claims and matching owner/admin policies. Do not give the Render service the Supabase service-role key. Until that database-role/RLS boundary is in place and reviewed, treat per-row database RLS as a production blocker even though API ownership checks and browser denial are implemented.

## Staging rollout

1. Deploy this code to staging and run `npm run db:migrate` against the staging Supabase project before starting the server. This creates `security_events`, enables RLS on the related tables, and revokes browser grants.
2. Keep `DATABASE_URL`, `ROBOFLOW_API_KEY`, Resend/SMTP credentials, and `ADMIN_MFA_ENCRYPTION_KEY` in Render's secret manager. Rotate any credential that was previously committed or shared in a public log.
3. Verify patient A cannot read patient B's profile, appointments, messages, invoices, assessment rows, or assessment images, including by changing URL IDs. Verify a patient session cannot call admin data routes and an unauthenticated request cannot call them.
4. Verify the signup limit, login/MFA throttles, email verification, idle session expiry, admin activity history, and the new admin security-events endpoint using test accounts.
5. No build, lint, integration, mobile-device, live-provider, or database migration run was performed as part of this code change. Complete those checks in staging with synthetic data before considering a production launch.
