# Deployment readiness status

**Status: migration prepared in code, not applied; not ready for production.** The application code and schema now target Supabase PostgreSQL, but no live Supabase connection, Vercel project, Render service, permanent domain, configured secrets, backup plan, or device validation has been completed. No real patient data was read, copied, or used.

## Implemented in the repository

- PostgreSQL connection adapter using `pg`, parameterized query placeholders, pooled connections, and transaction support.
- Initial Supabase SQL migration for the existing clinic tables, indexes, foreign keys, and RLS/grant hardening, plus a generic settings table.
- Runtime data layer and API queries converted from synchronous SQLite access to PostgreSQL calls.
- Admin creation, MFA enrollment, and MFA recovery scripts switched to PostgreSQL.
- Resend email delivery with SMTP fallback, plus an operator-only test email command; provider secrets are server-side environment values.
- One-time read-only SQLite importer that copies matching table data and referenced assessment photos, verifies file SHA-256 hashes, and refuses a populated target.
- Vercel API rewrite template and staging configuration/environment documentation for Vercel, Render, and Supabase.
- Removed SQLite backup and staging-validation scripts; they no longer represent the PostgreSQL architecture.

## Architecture and environment

| Service | Intended role | Required configuration |
| --- | --- | --- |
| Vercel | React/Vite frontend and same-origin `/api/*` proxy | Build `npm run build`; replace the Render URL placeholder in `vercel.json`. |
| Render | One Node.js 22.13+ backend instance | `NODE_ENV=production`, `DATABASE_URL`, `UPLOADS_DIR` on a persistent disk, HTTPS proxy settings, Roboflow/Resend-or-SMTP/MFA secrets. |
| Supabase | PostgreSQL database | Apply `supabase/migrations/` using `npm run db:migrate`; use TLS and direct or session-pooler URL. |

The browser does not need Supabase API keys for the current server architecture. `DATABASE_URL` is the sensitive backend credential and must remain on Render. The backend uses opaque random sessions stored as database hashes, so a separate session-signing secret is not currently required. The key list is documented in [`staging-deployment.md`](staging-deployment.md) and `.env.staging.example`.

## Remaining security and operational risks

1. **No live database validation:** schema syntax, connection TLS, query behavior, and transaction behavior have not been verified against a Supabase staging project.
2. **No hosting configuration:** the Vercel rewrite still contains a placeholder, and the Render origin/domain, disk capacity, plan, and region are not selected.
3. **Backup gap:** the SQLite backup tools were removed. A coordinated database-plus-photo backup, retention plan, failure notification, and restore drill must be configured before staging sign-off.
4. **Runtime database privilege:** `DATABASE_URL` must be protected as a high-privilege secret. Consider a dedicated restricted PostgreSQL runtime role and review RLS/grants before production; Supabase service-role keys bypass RLS and are not used by this code.
5. **Healthcare data decisions:** the clinic still needs to approve consent text, retention periods, deletion deadlines, backup expiry, staff access, incident response, and the exact Roboflow data-handling terms.
6. **Mobile hardware validation:** Android and iOS camera permissions, front/rear lenses, upside-down orientation, photo quality, uploads, and small-screen layout have not been validated against the hosted staging domain.
7. **Functional staging tests:** registration, login, appointments, assessment history, password recovery, restart persistence, and migration/restore flows still need end-to-end tests against the new PostgreSQL staging environment using synthetic data.
8. **Local code checks:** `npm run build`, focused lint on `server/` and `scripts/`, and Node syntax checks pass. Full-project `npm run lint` still reports 33 errors and 8 warnings in React/UI code; resolve those before treating the whole repository as lint-clean. The build also reports a large JavaScript bundle warning.
9. **Credential hygiene:** the Resend API key was pasted into the conversation and used for the requested test email. Revoke it and replace it in the ignored local `.env` and hosted secret store before further use. The local `.env` is ignored by Git; do not add it to a commit or deploy bundle.
10. **Dependency audit:** the production dependency audit reports zero vulnerabilities. The full dependency tree reports six moderate advisories in development/lint dependencies (`minimatch` via ESLint); the available automatic fix would make a breaking ESLint change, so review and resolve deliberately.

## Migration, backup, and recovery

Use [`supabase-migration.md`](supabase-migration.md) for the schema apply, one-time import, file transfer, and rollback procedures. Keep the old SQLite source read-only and offline until the PostgreSQL target, image files, application behavior, and backups are verified. Do not roll back to SQLite after accepting new writes unless a separately planned reverse export reconciles those changes.

The repository currently has no automated PostgreSQL-plus-photo backup job. Select a Supabase database backup/export approach and a Render-disk photo backup approach, encrypt off-host copies, and restore both together into an isolated staging target before production consideration.

## Production launch checklist

- [ ] Apply migrations to a new Supabase staging project and confirm RLS and grants.
- [ ] Configure Render secrets, one service instance, and persistent photo disk.
- [ ] Replace the placeholder Render URL in `vercel.json`; verify same-origin API and Secure cookies on the chosen staging domain.
- [ ] Complete build/lint and PostgreSQL-backed end-to-end tests using only synthetic data.
- [ ] Test data and photos after restart; test a complete backup restoration and failure alerts.
- [ ] Test the camera flow on Android and iOS.
- [ ] Approve patient consent, retention, deletion, backup, access, incident response, and Roboflow handling policies.
- [ ] Review database privileges and complete a security review against the actual deployed configuration.

**Go-live recommendation: no.** Keep real patient data disabled until the above items pass and the clinic’s responsible owners sign off.
