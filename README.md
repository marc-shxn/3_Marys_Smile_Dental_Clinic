# 3 Mary’s Smile Clinic Workspace

This project contains the public clinic website, patient accounts and appointments, an admin dashboard, and an AI oral-health assessment flow. The frontend is a React/Vite app, the API is Node.js/Express-style routing, PostgreSQL is hosted on Supabase, and assessment photos are stored on persistent backend storage.

## Local development

Requirements: Node.js 22.13 or newer and access to a disposable PostgreSQL database. Never use real patient records or photos for development.

1. Copy `.env.example` to `.env` and privately set `DATABASE_URL`, `UPLOADS_DIR`, and the local testing credentials you need.
2. Run `npm ci`.
3. Apply the database schema with `npm run db:migrate`.
4. Create an admin with `npm run admin:create`, then enroll MFA with `npm run admin:mfa:setup -- admin@example.com`.
5. Run `npm run dev` and open the local Vite address. Vite forwards `/api/*` to the Node backend.

The backend requires a PostgreSQL database; it no longer creates or serves a SQLite database. `npm start` is the production entrypoint and requires `NODE_ENV=production`, `DATABASE_URL`, `UPLOADS_DIR`, Resend or SMTP credentials, Roboflow secrets, and HTTPS proxy configuration. `vite preview` is not a production server. Keep `RESEND_API_KEY` on the server and set `RESEND_FROM` to a sender authorized by your Resend account.

To send a one-off test message, set `RESEND_API_KEY` and `TEST_EMAIL_TO` in the local environment and run `npm run email:test`. The command sends a test-only “Hello World” email; it does not expose the API key in the frontend.

## Staging architecture

The intended staging layout is Vercel for the static frontend, Render for one Node backend instance with a persistent disk for uploaded photos, and Supabase PostgreSQL for relational data. `vercel.json` proxies browser `/api/*` requests to the Render service so cookies and API calls remain on the Vercel site origin. Replace the Render URL placeholder after creating the backend service.

Start with [`docs/staging-deployment.md`](docs/staging-deployment.md) and [`docs/supabase-migration.md`](docs/supabase-migration.md). Set secrets in the hosting provider’s secret manager. Do not use real patient photos or account data during staging.

## Patient routes

- `/patient-login` — sign in
- `/create-account` — create and verify a patient account
- `/forgot-password` and `/reset-password` — password recovery
- `/patient-portal` — signed-in patient landing page
- `/book-appointment` — appointment request form
- `/ai-dental-assessment` — guided photos and AI assessment
- `/admin` — clinic admin dashboard

## Code layout

- `src/admin/` — staff dashboard pages and layout
- `src/user/` — public site, patient account screens, booking, and AI assessment
- `src/shared/` — reusable components, API helpers, and shared clinic data
- `server/` — Node API, PostgreSQL access, authentication, email, MFA, and Roboflow integration
- `supabase/migrations/` — versioned PostgreSQL schema migrations
- `scripts/migrate-sqlite-to-postgres.js` — explicit, one-time, read-only SQLite data importer

## Database and sensitive files

Apply schema changes with `npm run db:migrate`; do not edit the Supabase schema by hand after deployment. `npm run db:import-sqlite -- <path-to-old-clinic.sqlite>` is an operator-run migration command and is never part of server startup. It refuses to import into a non-empty target. Keep the old database and its upload folder unchanged until row counts, image checksums, application flows, and a restorable backup have been verified.

Patient passwords use salted scrypt hashes. Session cookies are opaque random tokens; only token hashes are stored in PostgreSQL, so the app does not need a separate signing secret. Admin MFA seeds are encrypted with `ADMIN_MFA_ENCRYPTION_KEY`. The server talks to PostgreSQL directly through `DATABASE_URL`; Supabase Data API keys are not needed by the current code. Never expose `DATABASE_URL` or a Supabase service-role key to Vite or the browser.

Assessment image bytes stay on the backend persistent disk, while PostgreSQL stores protected metadata and relative file paths. Patient-facing image endpoints enforce session ownership; admin endpoints require an admin session. Photo consent, deletion, retention, backup retention, and Roboflow processing terms still need clinic approval before real patient data is used. See [`docs/data-retention.md`](docs/data-retention.md).

## Roboflow

For inference, set `ROBOFLOW_API_KEY` in the Render secret manager. `ROBOFLOW_WORKSPACE_SLUG` and `ROBOFLOW_WORKFLOW_ID` select the Workflow. The browser never receives the API key. `npm run smoke:roboflow` sends a synthetic image to Roboflow and may incur usage; use it only after intentionally configuring a staging key. Automated or local validation should use synthetic images only.
