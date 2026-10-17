---
name: Audit tool runtime boundaries
description: Actual clock and CSV-envelope handling for exactly-once managed metadata inspections.
---

Use an impure helper for the actual clock when checking time-limited authority
in CodeExecution; do not assume durable-scope Date.now is available.

**Why:** The runtime rejected Date.now before the database invocation, despite
the general tool documentation describing deterministic clock support.

**How to apply:** Validate the authorization window before journaling or invoking
the database callback. This applies to the tool sandbox, not ordinary Node
scripts. Keep local preflight failures distinct from actual provider calls.

A managed SQL result containing a JSON cell may still be CSV, with an outer
quoted field and doubled quotes.

**Why:** Parsing the first identity result directly as JSON failed after the
single authorized query had already succeeded.

**How to apply:** Decode the CSV envelope offline, then parse the JSON cell.
Never repeat the database operation to fix a local parsing problem. Journal
before invocation and preserve terminal/no-replay state after a failed gate.
