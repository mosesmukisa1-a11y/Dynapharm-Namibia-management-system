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

Schema-expression sanitization must not silently destroy the evidence required
for exact offline reconstruction.

**Why:** Expression sanitization removed four status-field default expressions.
An application's row-write fallbacks are not proof of the database defaults.
Without comparable expression provenance, a one-operation inspection cannot
recover them after access has closed.

**How to apply:** Before any future narrowly authorized snapshot, design an
owner-approved safe expression policy and, where permitted, comparable
fingerprints for expressions that may be redacted. Never infer a redacted
default from a writer's fallback or weaken the terminal no-replay journal.

Narrow catalog completeness is not full disposable-application schema completeness.

**Why:** Exact contracts for the approved schema objects passed while a real
repository-only application run exposed other legacy schema dependencies.
A successful login/security browser path did not exercise those stock paths.

**How to apply:** Keep scoped contract, schema convergence, full database suite,
and authenticated workflow results separate. Do not invent unrelated legacy
tables or promote a passing narrow browser journey to a full release gate.
