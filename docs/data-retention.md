# Patient data and AI assessment handling

This file records current application behavior and decisions the clinic still needs to approve. It is not a substitute for review by the clinic’s privacy, legal, security, and clinical owners.

## Current application behavior

- Patient account, clinic record, appointment, visit, medical history, message, invoice, and AI assessment metadata are stored in Supabase PostgreSQL after the migration is applied.
- Assessment images are stored on the backend’s persistent disk under `UPLOADS_DIR/assessment-uploads`; the database stores their relative paths and metadata.
- Image endpoints require a patient session belonging to that record or an authenticated admin session. The path handler rejects path traversal and symbolic links.
- The patient can delete a saved assessment from assessment history. The application deletes its assessment and image rows, queues the associated photo paths, and removes the files. Admin patient deletion queues linked assessment photos for the same cleanup flow.
- Database and file deletions cannot remove copies that already exist in provider snapshots or backups. Those copies remain subject to backup retention and expiry.
- After photo consent, the server sends the selected image to the configured Roboflow hosted workflow for preliminary analysis. The request omits patient account identifiers, but an oral photo may still identify a person.
- Supabase Data API access for `anon` and `authenticated` is revoked in the SQL migration. The current browser communicates with the Node API; it does not query Supabase directly.

## Decisions required before real patient data

| Topic | Current status | Decision needed |
| --- | --- | --- |
| Photo and AI consent | App requests consent in the assessment flow. | Approve final wording, withdrawal flow, guardian consent, and proof/version retention. |
| Primary data retention | No automatic record purge. | Set retention periods for accounts, images, reports, messages, and audit records. |
| Assessment deletion | App deletion removes active database rows and associated files. | Define request verification, response deadlines, audit proof, and backup-expiry handling. |
| Backup retention | No Postgres-plus-photo backup automation is configured in this repository. | Select encrypted backup storage, retention, access, failure alerts, and restore cadence. |
| File access | Authenticated patient ownership or admin authorization is enforced by the Node API. | Review staff roles, least privilege, access monitoring, and emergency access. |
| Roboflow handling | App sends assessment images to the configured hosted workflow. | Verify the exact plan, endpoint, data retention, subprocessors, location, and required contractual protections before sending real images. |
| Incident response | Not defined in code. | Name operators and define breach triage, notification, credential rotation, and evidence handling. |

Do not send real patient photos to Roboflow until the clinic confirms its account and contract permit this use and required protections are in place. Keep `DATABASE_URL`, mail credentials, Roboflow keys, and the MFA encryption key in Render’s secret manager. Do not put them in Vercel frontend settings or `VITE_*` values.

## Backup and deletion limitations

Database backups and Render persistent-disk photo backups are separate systems. A restore must use matching snapshots or it can create missing photos or orphan files. A normal record deletion cannot erase data from an existing backup; expired backups must age out under the approved retention plan, or an operator must apply a separately documented secure deletion procedure. The clinic has not yet approved a retention schedule.
