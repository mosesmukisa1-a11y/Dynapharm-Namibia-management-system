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

Public release status attests only the serving web instance's declared identity,
local policy and cached readiness, not all deployed workers or credential safety.

**Why:** A separate worker may exist outside this process, and a compromised
server can lie. A checksum is not a signed platform attestation.

**How to apply:** Retain independent control-plane, recovery and credential
containment gates; never close them solely from an endpoint response.
