---
name: Audit tool runtime boundaries
description: Actual clock, offline result decoding and invocation-owned evidence for security audits.
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

Nonce-scoped identity observations are not reusable expected-target attestations.

**Why:** Retained database fingerprints were computed with an ephemeral nonce;
both that nonce and the raw identity were deliberately discarded. A later
counts-only operation could not independently compare its target against them.

**How to apply:** When authorization requires an independent expected identity,
require a protected approved identity or reproducible fingerprint protocol.
Never discover a new identity and silently accept it as its own expectation.
If the prerequisite is missing, record zero invocations and no counts; do not
infer NOT_REFERENCED from a blocked or empty-result attempt.

Check tool persistence before accepting a volatile-memory-only identity protocol.

**Why:** The exposed managed SQL callback uses the durable tool runtime, which
records callback inputs/results. Omitting console/report output does not keep
a returned raw identity or its later bound parameter exclusively in memory.

**How to apply:** When the owner explicitly forbids retention of raw identity
or parameters, require an attested non-retaining managed execution path before
the first call. Do not treat an impure helper as a way to invoke durable callbacks
privately, substitute direct credentials, or silently weaken the protocol.

An explicitly owner-authorized two-operation server-side fingerprint protocol
can avoid raw-identity retention by the managed callback.

**Why:** The owner authorized the first guarded operation to return only a
salted one-way fingerprint, followed immediately by a same-target comparison.
Public salt and fingerprint may be retained; the raw identity must remain
inside PostgreSQL, never returned or bound as a parameter.

**How to apply:** Use this alternative only under explicit scope, keep both
read-only/recovery guards and the exact catalog/type/privilege gate, preserve
counts classification, and journal terminal no-retry results. Keep the public
salt with the fingerprint; neither is authority for another production query.

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

Schema comparison may normalize installation-generated internal RI trigger OID
digits, but must retain all constraint, function, column and sequence semantics.

**Why:** Fresh disposable clusters assign different catalog OIDs to identical
foreign-key triggers. Literal generated names differ without schema drift.

**How to apply:** Normalize only the documented generated-name component;
preserve exact captured definitions and compare every other attribute.

Passing the complete disposable database suite does not clear a generic SQL
executor or prove all production-reachable query families safe.

**Why:** The release protocol separately requires caller, alias, callback and
import propagation review, plus hostile-input coverage for each reachable
endpoint family. A bounded syntax proof or a passing read path is not that proof.

**How to apply:** Preserve unresolved locations as release blockers. Distinguish
actual endpoint/service tests with inert query recording from PostgreSQL sentinel
tests and real-session browser checks; none substitutes for the others.

Treat constant arrays and objects as mutable when proving SQL structure.

**Why:** A fixed initial key list can be changed through an alias, computed key
write, or replaced map method; a callback index is not then demonstrably native.

**How to apply:** Check all references/escapes and method writes before using
fixed-key or numeric-iterator proofs. Keep hostile mutation regressions alongside
positive proofs and do not infer whole-program safety from these local checks.

Pin source-audit coverage by file and exact source span, not raw AST visitor count.

**Why:** Binding-aware Babel traversal can revisit a call path; a retained
66-location audit produced 67 visitor records without any missing source location.

**How to apply:** Collect paths before binding recursion, deduplicate exact spans,
record repeated visits, and assert that every original distinct location remains
present. Never use deduplication to discard unresolved locations.

Verification outputs must be owned by one invocation, not copied from a shared
latest-result filename.

**Why:** A failed child left a previous successful result at the shared path.
Copying it made an unsuccessful invocation appear to contain passing evidence.

**How to apply:** Use a fresh nonce directory and matching owner identity/source
fingerprint for every child output. Missing output is NOT VERIFIED even if an
older file exists elsewhere. Preserve invalidated evidence explicitly rather
than silently replacing it or counting it as a current pass.
