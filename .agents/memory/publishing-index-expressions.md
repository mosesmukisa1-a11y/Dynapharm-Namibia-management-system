---
name: Publishing index expressions
description: Publishing can truncate long functional index keys despite valid original PostgreSQL DDL.
---
Compare the actual generated development-to-production schema diff when publishing fails during database migration; valid migration source SQL does not prove the generated SQL is valid.

**Why:** Publishing emitted truncated stock-location index keys for both a nested COALESCE/NULLIF expression and a CASE alternative. The frontend build and security scan succeeded; changing packages would not address this failure.

**How to apply:** Prefer short indexed expressions when encountering this introspection issue. Separate explicit location and warehouse-fallback indexes while preserving the original query's null/empty semantics. Verify the regenerated diff by executing it against empty schema copies in a rolled-back development transaction, never by mutating production directly.
