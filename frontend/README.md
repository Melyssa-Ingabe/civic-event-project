# CivicEvents+ Frontend

An accessible, responsive frontend for the CivicEvents+ API: city events, audio announcements, captioned promo videos, in-app notifications, an admin dashboard and user management.

**Tech:** HTML, Tailwind CSS (CDN) and jQuery only. No build step.

---

## Features

| Feature | Normal user | Admin |
|---|---|---|
| Sign up / log in (password strength meter, session or "remember me") | ✅ | ✅ |
| Dashboard | Own stats (`/dashboard/me`) | Platform stats + chart (`/dashboard/admin`), auto-refresh |
| Events | Browse published events, search, filter by date/location, pagination, register / cancel, leave one feedback per event | Create / edit (with image upload + preview) / delete, see attendees and all feedback with average rating |
| Announcements (audio) | Listen with an accessible custom player | Upload audio, publish / unpublish, edit, delete |
| Promos (video) | Watch with captions (on by default, toggle) + transcript | Upload video + captions, publish / unpublish, edit, delete |
| Notifications | Bell with unread count, drawer, inbox, detail with link to the related event | Delete one or many (admin form) |
| Profile | Update name and email (role/status locked) | Same |
| Users | – | List, search, filter, view profile, enable / disable (roles can't be changed) |

---

## 1. Run the backend

Full details are in `backend/README.md`. In short:

1. Install **Node.js 18+** and **PostgreSQL 15+** (pgAdmin is included).
2. In pgAdmin, create the database (quotes are needed because of the hyphens):
   ```sql
   CREATE DATABASE "civic-events-db";
   ```
3. Open a Query Tool on `civic-events-db` and run `backend/migrations/001_create_tables.sql`.
4. Set your database credentials in `backend/.env`:
   ```
   DB_USER=postgres
   DB_PASS=<your-postgres-password>
   DB_PASSWORD=<your-postgres-password>
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=civic-events-db
   JWT_SECRET=<any-long-random-string>
   ```
5. Install and start:
   ```bash
   cd backend
   npm install
   npm run dev
   ```
   Expected output: `CivicEvents+ backend listening on port 4000` and `Connected to PostgreSQL`.

### Create an admin account
1. Sign up through the frontend (or Postman) with e.g. `admin@gmail.com`.
2. Promote it in pgAdmin:
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'admin@gmail.com';
   ```

---

## 2. Run the frontend

The frontend is static files, so any local web server works.

**Option A – VS Code Live Server (recommended)**
Install the *Live Server* extension, right-click `frontend/index.html` → **Open with Live Server**.
It opens at `http://127.0.0.1:5500/frontend/index.html`.

**Option B – command line**
```bash
npx serve frontend
# or
cd frontend && python -m http.server 5500
```

### Connecting to the backend (API base URL)
The frontend has no `.env` file. The backend address is set in **one place**, `frontend/js/config.js`:

```js
API_BASE_URL: 'http://localhost:4000',   // all requests go to http://localhost:4000/api/...
```

Change it if your backend runs on another host or port. The backend already has CORS enabled, and uploaded files are served from `http://localhost:4000/uploads/...`.

---

## 3. Project structure

```
frontend/
├── index.html                 Entry: redirects to dashboard or login
├── login.html, signup.html    Authentication
├── dashboard.html             Admin or user dashboard
├── events.html                Event list (search, filters, pagination)
├── event.html                 Event detail, register/cancel, feedback, attendees (admin)
├── event-form.html            Create / edit event (admin)
├── my-registrations.html      User's registered events
├── announcements.html         Audio announcements list
├── announcement.html          Announcement detail + audio player
├── announcement-form.html     Create / edit announcement (admin)
├── promos.html                Promo videos list
├── promo.html                 Promo detail + captioned video
├── promo-form.html            Create / edit promo (admin)
├── notifications.html         Notification inbox (+ admin delete form)
├── notification.html          Notification detail
├── profile.html               My profile
├── admin-users.html           User management (admin)
├── css/styles.css             Shared component classes (buttons, inputs, cards)
└── js/
    ├── config.js              API base URL, storage keys, upload limits
    ├── ui.js                  Toasts, loaders, skeletons, confirm dialog, form errors, formatting
    ├── auth.js                Auth context (token + user) and ROLE-BASED ACCESS GUARDS
    ├── api.js                 $.ajax wrapper: Bearer token, error handling, uploads, caching
    ├── layout.js              Navbar, notification bell/drawer, footer, admin sidebar
    ├── events.js              Shared event helpers (cards, register/cancel, delete)
    └── media.js               Audio player, captions (WebVTT), publish/unpublish, lazy videos
```

---

## 4. Authentication & role-based access

**Token storage** (`js/auth.js`)
- Default: `sessionStorage`, cleared when the browser/tab closes.
- "Keep me signed in": `localStorage`. Trade-off: it persists, but any script on the page can read it, so all API text is escaped before display to reduce XSS risk.
- The JWT's `exp` is read on every page. When it expires the user is signed out automatically with a message.
- Every protected request sends `Authorization: Bearer <token>` (`js/api.js`).

**Where the role guards are** (search the code for `ROLE GUARD`):

| Guard | Location | What it does |
|---|---|---|
| `Auth.requireAuth()` | `js/auth.js` (GUARD 1) | Any protected page: no token → login, expired → sign out |
| `Auth.requireAdmin()` | `js/auth.js` (GUARD 2) | Admin-only pages (all `*-form.html`, `admin-users.html`): normal users are redirected with a message |
| `Auth.redirectIfLoggedIn()` | `js/auth.js` (GUARD 3) | Login/signup pages |
| `Auth.applyRoleUI()` | `js/auth.js` (GUARD 4) | Removes elements marked `data-admin-only` / `data-user-only` |
| Card/detail templates | `events.js`, `media.js`, page scripts | Edit/Delete/Publish only rendered for admins; Register/Feedback only for users |
| API responses | `js/api.js` | 401 → sign out + login, 403 → "contact an administrator" message |

> Frontend guards are for user experience only. **Real security is enforced by the backend** (`authenticate` + `authorize(['admin'])` on every protected route).

---

## 5. UX & accessibility

- Semantic HTML, skip link, labelled form fields, `aria-live` regions, `aria-invalid` field errors, visible focus rings, keyboard-friendly dialogs (Esc, focus trap).
- Colour choices meet WCAG AA contrast; respects `prefers-reduced-motion`.
- Mobile-first responsive layouts (cards stack, navbar collapses to a menu).
- Skeleton loaders, loading buttons, toasts, confirm dialogs, empty and error states with **Try again**.
- Client-side validation before every request, and file type/size checked **before** upload, with an upload progress bar.
- Optimistic UI (publish/unpublish, enable/disable, notification delete/read) that reverts if the request fails.
- Lists cached in `sessionStorage` and invalidated on create/update/delete. Promo videos lazy-load when scrolled into view.

---

## 6. Known backend limitations (and how the frontend handles them)

| Backend behaviour | Frontend handling |
|---|---|
| Events API ignores `published` (every event is published) | The toggle is shown but locked, with an explanation |
| `GET /event-feedback/event/:id` is admin-only | Admins see all feedback + average; users see their own feedback |
| No "mark notification as read" endpoint | Read state is stored per user in `localStorage` |
| No endpoint to create custom notifications | Notifications are created automatically by the backend |
| Promo captions are stored as plain text | Converted to a WebVTT `<track>` in the browser and also shown as a transcript |
| No list pagination/filter query params | Search, filters and pagination are done client-side |
| Deleting an event with registrations fails (no cascade) | A clear error message is shown |

---

## 7. Demo video

See `video-demo/README.md` for the walkthrough link.