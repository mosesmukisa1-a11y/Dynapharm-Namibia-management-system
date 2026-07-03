---
name: Portal route naming
description: Correct URL patterns for the multi-portal routes in this app, to avoid mistaking a wrong-URL blank page for a real bug.
---

Portal routes in `client/src/App.jsx` are short role names, not suffixed with "-portal":
`/consultant`, `/branch`, `/finance`, `/gm`, `/director`, `/mis`, `/stock`, `/admin`, `/training`, `/frontdesk`, `/hr`, `/distributor`, `/support-staff`.

**Why:** Navigating to a plausible-but-wrong URL like `/consultant-portal` matches no `<Route>`, so React Router renders nothing — a fully blank white page with no console errors besides an incidental 401 from `/api/auth/me`. This looks identical to a real rendering crash and can send debugging down the wrong path.

**How to apply:** Before diagnosing a "blank page" report for any portal, or before writing an e2e test plan / screenshot check, confirm the exact route in `App.jsx` rather than guessing a "-portal" suffix.
