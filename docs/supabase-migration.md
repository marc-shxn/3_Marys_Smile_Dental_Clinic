# Supabase PostgreSQL migration

## What changed

- The Node API uses the `pg` driver and `DATABASE_URL`; application requests no longer open a local SQLite database.
- `supabase/migrations/20261104000000_initial_schema.sql` creates the PostgreSQL tables, keys, checks, and indexes. It includes patient/admin accounts, sessions and recovery/MFA records, patients, medical history, appointments, visits, conversations/messages, notifications, AI assessments/images, invoices/receipts, goals, reports, and a generic `app_settings` table. The previous SQLite schema had no separate settings table; admin profile settings were stored on the admin account.
- Row-level security is enabled on application tables and direct grants to the Supabase `anon` and `authenticated` roles are revoked. The current browser still uses the existing Node API and does not query Supabase directly.
- Uploaded assessment images remain files under `UPLOADS_DIR`; PostgreSQL stores their metadata and relative paths.
- Authentication behavior, API routes, password hashing, email verification, password recovery, admin MFA, and same-origin `/api/*` calls remain in the Node app.

## Connection configuration

Set these in Render’s private environment settings. Do not send database credentials in chat, commit them, or put them in a `VITE_*` variable.

| Variable | Use |
| --- | --- |
| `DATABASE_URL` | Required PostgreSQL connection string; keep it on Render only. |
| `DATABASE_SSL` | `require` by default. `disable` is only for a trusted local database. |
| `PG_POOL_MAX` | Per-instance PostgreSQL pool limit; default is 8. |
| `UPLOADS_DIR` | Required path on Render’s attached persistent disk. |
| `SUPABASE_URL` | Optional identifier; current server does not use the HTTP Data API. |
| `SUPABASE_ANON_KEY` | Not used by the current backend; never use it as a database password. |
| `SUPABASE_SERVICE_ROLE_KEY` | Not used by the current backend; leave unset unless a separate server-side Supabase API integration is later added. Never expose it in Vite. |
| `ROBOFLOW_API_KEY` | Server-side inference key. Use synthetic images in staging. |
| `RESEND_API_KEY`, `RESEND_FROM` | Preferred mail delivery for patient verification and password recovery. Keep the API key in Render secrets and use a verified sender for production. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_STARTTLS`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Optional SMTP fallback, used when `RESEND_API_KEY` is not set. Store credentials as secrets. |
| `ADMIN_MFA_ENCRYPTION_KEY` | Base64 32-byte key encrypting admin authenticator seeds; back it up separately from database backups. |
| `NODE_ENV` | Set to `production` on Render. |
| `REQUIRE_HTTPS`, `TRUST_PROXY` | Set both to `true` behind Render’s HTTPS proxy. |

The Node backend connects directly to PostgreSQL, so its database URL is the credential that matters. Supabase’s API keys do not replace `DATABASE_URL`. For Render’s long-running service, use Supabase’s direct connection when the network supports it; otherwise use the **session pooler** connection from the Supabase Connect panel. The app uses explicit `BEGIN`/`COMMIT` transactions, so do not use the transaction pooler. Keep SSL enabled. [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres)

Run `npm run db:migrate` from an operator environment with the migration connection privately configured. The command applies sorted SQL files once and records each filename in `public.app_schema_migrations`. Do not apply the same changes manually in the Dashboard; use versioned migrations to avoid schema drift. [Supabase migration guidance](https://supabase.com/docs/guides/deployment/database-migrations)

## Existing SQLite data move

The importer is an explicit one-time tool. It opens the old SQLite database read-only, requires an empty PostgreSQL target (apart from the migration-created default clinic row), copies table data in foreign-key order inside one PostgreSQL transaction, copies referenced assessment image files, and verifies each copied image with SHA-256. It checks that every source column has a PostgreSQL counterpart and stops on schema mismatches, missing image files, unsafe paths, duplicate keys, or a populated target. It does not update or delete the SQLite source; resolve any reported condition before retrying.

Before any real-data migration is authorized:

1. Freeze writes to the old system and make a separate, verified copy of the SQLite file and its `assessment-uploads` directory. Keep the source untouched.
2. Apply the Supabase schema to a new, empty project. Record the source table counts, foreign-key checks, and image count using a controlled operator environment. Do not paste patient data or secrets into chat or source control.
3. Set `DATABASE_URL` to the new target, `LEGACY_UPLOADS_DIR` to the old data directory that contains `assessment-uploads`, and `UPLOADS_DIR` to a new empty directory. Run `npm run db:import-sqlite -- <path-to-clinic.sqlite>` from a host that can reach Supabase and both file directories.
4. If the import host is not the Render service, securely copy the resulting `assessment-uploads` tree to the Render persistent disk while the service is stopped or in maintenance mode. Preserve relative paths exactly. Do not serve the imported records until the files are present.
5. Compare row counts for every table, verify visit identity sequencing, compare photo hashes, then run the staging checklist with synthetic accounts/images. Take and restore a new backup before cutover.
6. Keep the old SQLite database and upload folder read-only and offline until the clinic approves the cutover and recovery window. Do not delete the source as part of the import.

The PostgreSQL migration includes every field in the prior application SQLite schema plus `app_settings` (which had no legacy equivalent). The importer does not invent missing historical values or discard unknown columns. If an older database is missing required fields or contains duplicate patient/invoice numbers or active appointment slots, first produce and verify a source-side correction plan; do not silently discard or overwrite records.

## Rollback

- **Before cutover:** keep the old app and SQLite files unchanged. If the PostgreSQL import fails, the transaction rolls back and copied image files are removed. Fix the reported condition and retry against a fresh empty target.
- **After cutover but before accepting writes:** route Vercel back to the prior backend and restore its original database/files. Keep the new Supabase data for investigation; do not drop it as part of routine rollback.
- **After accepting writes:** switching back to SQLite would lose new changes. Put the app in maintenance mode, preserve the Supabase database and image disk, and either fix forward or perform a separately planned reverse export and reconciliation. No automatic PostgreSQL-to-SQLite reverse migration is included.
- Keep versioned SQL migrations and a pre-cutover backup. If the Supabase project must be abandoned, restore into a new project rather than dropping tables in place until the replacement has been verified.

## Validation checklist

- [ ] `npm run db:migrate` reports no pending schema migration on the staging project.
- [ ] Confirm RLS is enabled and `anon`/`authenticated` have no table grants; only the backend has database credentials. Supabase warns that service-role credentials bypass RLS and must remain server-side. [Supabase RLS guidance](https://supabase.com/docs/guides/database/row-level-security)
- [ ] Build the Vite app and verify Vercel’s `/api/*` proxy points to the Render staging URL; browser requests and cookies must remain on the Vercel origin.
- [ ] Verify registration, email confirmation, login/logout, password recovery, admin login/MFA, profile changes, patient management, visits, appointments, and messages.
- [ ] Use synthetic assessment images to verify upload, Roboflow analysis, assessment history, image retrieval, and deletion.
- [ ] Restart the Render service and verify records and assessment photos remain available.
- [ ] Create a database backup and persistent-disk photo backup; restore both into an isolated staging target and verify row counts, foreign keys, and photo hashes.
- [ ] Repeat camera permission, front/rear camera, orientation, capture quality, responsive layout, and upload checks on real Android and iOS hardware.

No Supabase project or credentials were available to this workspace, so the SQL has not been applied to a live project and the importer has not been run against any database.
