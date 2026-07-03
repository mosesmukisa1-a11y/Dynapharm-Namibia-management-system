---
name: Auth user object field naming (fullName vs full_name)
description: sanitizeUser() in api/_lib/auth.js returns camelCase fullName, not full_name — frontend code reading user.full_name silently gets undefined.
---

The backend `sanitizeUser()` helper (`api/_lib/auth.js`) converts the DB's
`full_name` column into a camelCase `fullName` key on the object it returns
(and this is what `AuthContext`'s `user` state actually holds — it's a
straight passthrough of the login API's `user` field). Most other user
fields (`username`, `email`, `phone`, `role`, `branch`, `branches`) keep
their snake_case DB names unchanged.

**Why:** A previous fix read `user?.full_name` when displaying the logged-in
distributor's own name, which silently evaluated to `undefined` (no error)
and rendered a blank/dash instead of the name. Only caught via manual e2e
testing, not by any lint/type check, because JS silently returns `undefined`
for missing object keys.

**How to apply:** When reading the logged-in user's display name anywhere in
the frontend, check `user?.fullName` first (fall back to `user?.full_name`
only defensively). Don't assume DB column names carry through unchanged from
`sanitizeUser()`.
