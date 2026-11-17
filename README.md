# Time & Task Tracker Pro — Supabase Edition

This package keeps your supplied Obsidian & Gold HTML/CSS interface and connects authentication, profiles, tasks, attendance, breaks, activity logs, profile photos, and the active-shift counter to Supabase.

## Files
- `index.html`, `style.css`, `script.js` — app frontend
- `supabase-config.js` — project URL and publishable key
- `schema.sql` — database tables, RLS, triggers, RPC, Storage bucket, Realtime
- `manifest.json`, `sw.js` — installable PWA shell
- `vercel.json` — static hosting configuration

## Setup
1. In Supabase, open **SQL Editor**, paste all of `schema.sql`, and run it.
2. Confirm the final query returns `active_shift_count` (usually 0). If you previously ran older SQL, check the SQL Editor output for errors before proceeding.
3. In **Authentication → Providers → Email**, enable Email. For easier initial testing you may temporarily disable email confirmation; enable it again for production.
4. Open `supabase-config.js`. The URL and publishable key are prefilled from the project details previously supplied. A publishable key is safe in a browser; never put a `service_role` or secret key here.
5. Run locally with VS Code Live Server (not by double-clicking `index.html`).
6. Create an account. Public signups are always Employees. To promote the first manager/admin, copy that account UUID from Authentication → Users, then run a one-time SQL command as project owner: `update public.profiles set role='admin' where id='PASTE-USER-UUID-HERE';`
7. Deploy the whole folder to GitHub and import the repository into Vercel. No build command is needed; output directory is `.`.

## Important notes
- The online count means profiles with an open attendance row (`clock_out IS NULL`), not site visitors. It refreshes via the RPC, polling, and attendance Realtime events.
- Tasks and activity are now stored in Supabase rather than localStorage. Existing browser demo data is not automatically migrated.
- The AI Assistant expects `/api/ai`. It is intentionally not enabled without a secure server-side AI provider key and implementation. Never expose an AI key in frontend files.
- Before real payroll use, review your payroll rules and test with multiple accounts/roles. The supplied UI's payroll and analytics calculations are client-side presentation, not a payroll compliance engine.
- The SQL grants employee-owned attendance updates for this UI's clock/break workflow. For stricter tamper-resistant attendance, replace direct client updates with database RPC functions and audit rules before production.
