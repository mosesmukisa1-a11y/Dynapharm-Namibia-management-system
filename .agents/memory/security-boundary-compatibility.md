---
name: Security boundary compatibility
description: Preserve legitimate enriched writes and public machine protocols while narrowing SQL and error output.
---

A finite SQL field policy must cover the complete server-enriched record, not
only the fields initially supplied by the browser. It is a structural control,
not authorization or proof of the production schema.

**Why:** Strict validation initially rejected legitimate writes whose actor or
timestamp fields were added later. A few successful paths also missed other
existing writer families.

**How to apply:** Inventory all callers and their final enriched records using
repository-only owned schema fixtures. Snapshot before statement construction,
verify the complete regression suite, and obtain separate authority for any
production schema inspection. Do not loosen branch/role controls to make an
identifier allowlist pass.

Diagnostic redaction must retain the finite public machine protocol without
preserving arbitrary exception properties.

**Why:** Removing an entire failure body broke readiness interpretation even
though the HTTP failure status remained correct. Authentication challenges can
similarly depend on a safe fixed code rather than free-form error text.

**How to apply:** Define a small typed public failure schema and test its
compatibility alongside canary rejection. Never infer that a successful generic
error-boundary test proves every application response/log/export path private.
