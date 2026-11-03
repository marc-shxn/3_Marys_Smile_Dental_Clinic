# Source folder guide

- `admin/` contains the staff dashboard layout and pages. Replace or redesign this folder when updating the admin UI.
- `user/` contains the public clinic website, patient account pages, registration, booking, and AI assessment UI.
- `shared/` contains code used across both sides: reusable components, authentication API, storage hooks, global styles, and theme tokens.
- `App.jsx` is the route coordinator. `/admin` renders the admin dashboard; patient and public routes render from `user/`.
- `main.jsx` is the React entry point.
- AI assessment inference is handled server-side in `server/roboflowWorkflow.js`; use the root README's Roboflow setup and smoke-check instructions. Never place inference credentials in frontend code.

Keep shared behavior in `shared/` so the admin and patient-facing interfaces do not depend on each other’s page files.
