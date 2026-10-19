---
name: Backup supervisor runtime
description: Managed Linux/Python quirks affecting process ownership and external deadline enforcement.
---

Use the actual kernel-resolved Python interpreter for the external backup supervisor,
not a wrapper path reported as sys.executable.

**Why:** This runtime can report a workspace Python wrapper as sys.executable while
/proc/self/exe identifies the installed interpreter. Requiring root ownership alone
also rejects legitimate read-only Nix binaries owned by the workspace UID.

**How to apply:** Probe without source credentials, validate the resolved installed binary
and ownership/write permissions, then invoke it directly with isolated Python startup.
Never relax this into an arbitrary executable or preload environment.

Do not assume Linux exposes /proc/self/task/<pid>/children.

**Why:** That file and /proc/thread-self/children were absent here despite supported
subreapers and pidfds. A cleanup verifier relying on them failed at runtime.

**How to apply:** Use narrowly read local parent-PID metadata when needed, stable process
handles, and rechecked ownership before signalling. Keep the root deadline signal independent
of metadata enumeration; fail closed if child ownership or complete reaping is unverified.
Never read process command lines, environments or application data to discover children.

Separate supervisor deadline evidence from whole-test elapsed time.

**Why:** A fixed subsecond bound on total elapsed time conflates startup/scheduling
and descendant reaping with deadline enforcement; a loaded managed runner can
violate that bound after the deadline fired and the full process tree was reaped.

**How to apply:** Assert the configured deadline and observed expiry, root
termination, child exit and empty-tree evidence. Use a generous outer test
watchdog only as hang failure protection. Never extend production deadlines or
cleanup budgets to make fixture timing pass.
