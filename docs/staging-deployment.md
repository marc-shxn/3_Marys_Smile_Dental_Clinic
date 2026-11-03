# Staging deployment: Vercel, Render, Supabase

## Architecture

- **Vercel:** builds the React/Vite frontend. Its `/api/*` rewrite forwards requests to the Render backend while the browser stays on the Vercel origin.
- **Render:** one Node.js 22.13+ web service running `npm start`, with a persistent disk mounted for patient assessment photos and generated files.
- **Supabase:** PostgreSQL database reached from Render through `DATABASE_URL` over TLS.
- **Roboflow and mail:** staging-only credentials held in Render’s secret manager. Use Resend or SMTP with a dedicated test mailbox and synthetic accounts/images.

`vercel.json` contains `https://REPLACE_WITH_RENDER_SERVICE.onrender.com/api/:path*`. Replace that hostname with the Render service’s actual HTTPS origin after the service is created. The external rewrite keeps the requested URL unchanged in the browser. [Vercel rewrite documentation](https://vercel.com/docs/routing/rewrites)

Render’s local filesystem is ephemeral unless a persistent disk is attached. A persistent disk is available on paid web services, is attached to only one service instance, and prevents scaling that service to multiple instances. The current design therefore uses one backend instance and a disk mounted at `/var/data`; choose disk size and plan in Render before applying the configuration. [Render disk documentation](https://render.com/docs/disks) [Render free-plan limitations](https://render.com/docs/free)

## Setup sequence

1. Create a dedicated Supabase staging project and a Render web service in an approved region. No provider, region, permanent domain, or Render service URL has been created for this project yet.
2. In Render, use build command `npm ci && npm run build`, start command `npm start`, Node 22.13 or newer, one instance, and an attached persistent disk mounted at `/var/data`. Set `UPLOADS_DIR=/var/data/clinic`.
3. In the Supabase Connect panel, choose the direct connection if the Render network can reach it; otherwise use the shared **session** pooler. Set `DATABASE_URL` privately in Render, not Vercel. Keep TLS enabled. The transaction pooler is not suitable for this app's explicit transactions. [Supabase connection documentation](https://supabase.com/docs/guides/database/connecting-to-postgres)
4. In a trusted operator environment, set `DATABASE_URL` and run `npm run db:migrate`. Confirm all migrations are recorded. Do not put database credentials in the frontend project.
5. Configure Render secrets and variables listed below. Configure Resend or SMTP for a dedicated test mailbox. Set a staging Roboflow key only if using synthetic images in its service.
6. Deploy the frontend to Vercel and replace the Render URL in `vercel.json`; redeploy. Check a patient API call and an admin API call from the Vercel site and confirm session cookies are `Secure`, `HttpOnly`, and `SameSite=Lax`.
7. Create the first admin using a secured operator shell with `npm run admin:create`, then configure `ADMIN_MFA_ENCRYPTION_KEY` in Render and enroll MFA with `npm run admin:mfa:setup -- admin@example.com`. Never save the printed authenticator secret in source control or a deployment log.
8. Run the functional and mobile validation checklist below. Do not add real patient data.

## Environment variables

| Variable | Required | Where / notes |
| --- | --- | --- |
| `NODE_ENV` | Yes | Render: `production`. |
| `PORT`, `HOST` | Render-provided | App defaults to `8787` and `0.0.0.0`. |
| `DATABASE_URL` | Yes | Render secret. Direct or session-pooler PostgreSQL connection URL. |
| `DATABASE_SSL` | Yes | Keep `require`; only set `disable` for a trusted local development database. |
| `PG_POOL_MAX` | Optional | Default `8`, per backend instance. |
| `UPLOADS_DIR` | Yes | `/var/data/clinic`, inside the attached persistent disk. |
| `REQUIRE_HTTPS`, `TRUST_PROXY` | Yes | Set both `true`; keep the app behind Render’s HTTPS proxy. |
| `ROBOFLOW_API_KEY` | For AI checks | Render secret; never a Vite variable. Use synthetic images only. |
| `ROBOFLOW_WORKSPACE_SLUG`, `ROBOFLOW_WORKFLOW_ID` | For AI checks | Current defaults identify the configured workflow; verify in the staging account. |
| `RESEND_API_KEY`, `RESEND_FROM` | Yes, if using Resend | Keep the key in Render secrets; use an authorized sender. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_STARTTLS`, `SMTP_FROM` | Yes, if using SMTP | Staging mail transport fallback. |
| `SMTP_USER`, `SMTP_PASSWORD` | If needed | Render secrets from the SMTP provider. |
| `ADMIN_MFA_ENCRYPTION_KEY` | Yes | Base64-encoded 32-byte Render secret. Keep a separate recovery copy. |
| `SUPABASE_URL` | Optional | Project identifier; not used by the current app. |
| `SUPABASE_ANON_KEY` | No | Not used by the current app. Never expose service credentials in the browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Not used by the current app. Keep unset unless a later server-side Data API integration needs it. |

No separate `SESSION_SECRET` is needed in the current design: the server generates random opaque session tokens and stores only their hashes in PostgreSQL. The database URL is itself a highly privileged secret; keep it only in Render, restrict project access, and consider a dedicated least-privilege PostgreSQL runtime role before production.

## Backups and restore

The old SQLite backup scripts were removed because they would not back up the new PostgreSQL database. No automated Postgres-plus-photo backup/restore job is configured in this repository. Before staging sign-off, choose and configure:

- A Supabase database backup plan or scheduled encrypted logical dumps.
- A coordinated backup of the Render persistent photo disk, with a copy outside the Render service and a retention period approved by the clinic.
- A recovery procedure that restores both database and photo files from the same point in time while the app is stopped or in maintenance mode.
- A monitored failure alert and a scheduled restore drill using synthetic data.

Supabase database backups do not include the files on Render’s disk. A file-only restore can leave database rows pointing to missing photos, and a database-only restore can leave photos orphaned. Keep both stores backed up and restore them as one recovery unit. Do not use production patient data for a restore test.

## Staging validation checklist

- [ ] `npm run db:migrate` succeeds against a new disposable Supabase staging project.
- [ ] `npm run build` and `npm run lint` complete successfully.
- [ ] Vercel serves the frontend on HTTPS and proxies all `/api/*` paths to the intended Render HTTPS origin.
- [ ] Render uses one Node instance and the persistent disk is mounted and writable only by the app user.
- [ ] Patient registration, email verification, login/logout, and password recovery work using test accounts.
- [ ] Admin login, MFA, password/profile changes, admin activity history, and patient record access work.
- [ ] Patient management, appointments, visits, messages, reports, and invoices behave as expected.
- [ ] Synthetic oral assessment photos upload, reach the selected Roboflow staging workflow, appear in history, and can be deleted with their files.
- [ ] Data and image files remain available after a Render restart.
- [ ] Database and photo backups are created, alerted on failure, and restored into an isolated staging target.
- [ ] On the available Android phone, check camera permission, front and rear cameras, portrait and upside-down orientation, preview/capture consistency, image quality, upload, and responsiveness.
- [ ] Repeat camera, rotation, permission, and responsive-layout checks on iOS before production.

The browser code and server-side migration are prepared, but no live deployment has been attempted. A permanent domain, Render service, Supabase project, secret values, backup plan, and iOS test device remain to be supplied or configured.
