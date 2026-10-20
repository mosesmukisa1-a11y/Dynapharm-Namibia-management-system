---
name: Detached release identity
description: Why release builds require reviewed detached archive evidence and what the public identity cannot prove.
---

Treat the release digest as the exact reviewed source archive's SHA-256, not a
runtime marker, deployment ID, Git tree or built-container digest.

**Why:** An archive cannot embed its own hash without changing it. Identity must
be derived after freezing the archive, then injected into the build from a
reviewed detached binding. A build lacking that binding is intentionally blocked.

**How to apply:** Keep source-archive and generated identity separate; verify
archive, approved manifest and extracted source before injection. Do not bypass
the missing-binding build failure with environment digests, placeholder hashes
or newly inventoried unreviewed source. Publishing transport must separately
prove it preserves the required derived files.

Automatic post-merge setup is not authorization for migrations or a release build.

**Why:** An old hook ran migrations before attempting an unbound build, which
then correctly failed the identity guard. Retrying that hook could repeat
database work, while the platform retry also reconciles/restarts workflows.

**How to apply:** Keep the automatic hook syntax-only and explicitly disclose
possibly stale dist. Run reviewed dependency/build/migration work only under its
separate authority. Do not retry platform reconciliation when restarts are barred.

Public release status attests only the serving web instance's declared identity,
local policy and cached readiness, not all deployed workers or credential safety.

**Why:** A separate worker may exist outside this process, and a compromised
server can lie. A checksum is not a signed platform attestation.

**How to apply:** Retain independent control-plane, recovery and credential
containment gates; never close them solely from an endpoint response.

Do not repeatedly request an internal Replit infrastructure inventory from
support.

**Why:** In an owner-provided support response recorded on 2026-10-20, support
declined internal workers/schedulers/legacy ownership, replica and build records
and directed verification to visible Publishing, Git and Security controls.

**How to apply:** Distinguish application-owned services from provider-internal
infrastructure. On 2026-10-20 the owner approved limiting ownership verification
to application-owned deployments, workers and schedules. Provider-internal
inventory remains UNKNOWN but is outside this ownership gate. Do not infer
absence of application-owned services or waive recovery, credential, candidate
integrity or transport checks. This approval is not publication authority.

The owner confirmed on 2026-10-20: “No—only the main web app” when asked about
separately deployed application workers or scheduled jobs.

**Why:** Source-declared worker capabilities were being mistaken for a reason
to repeatedly request an inventory of hypothetical deployed services.

**How to apply:** Treat the separate-service inventory as owner-attested none,
not independent platform enumeration. Reopen only with contrary/new evidence.
This does not establish the enabled state of timers inside the web process.

Do not treat documentation-search summaries or Git ignore checks as a publishing
file-delivery contract.

**Why:** Official-documentation searches gave inconsistent Git-ignore transport
summaries, while directly fetched configuration/publishing pages did not specify
ignored detached-dotfile delivery. A correct offline stage cannot settle that gap.

**How to apply:** Cite directly supported build/run behavior separately from
unknown build-context membership. Preserve the reviewed candidate when staging
works; require supported private input delivery before claiming publishing-input
readiness, and separate actual transport proof under later publication authority.
