# Controlled password rotation — PREPARED, NOT EXECUTED

## Authority and scope

No production account inspection, password rotation, session revocation, setting
change, restart, publication or scheduler stop is authorized during this phase.
The account list in `affected-account-candidates.md` is source-derived, not a
verified list of active production accounts. Do not guess account IDs from names.

Before execution, obtain a separate recorded authorization listing the exact
account IDs, approving actor, time window and private delivery procedure. Confirm
the actual account owner, role and current branch for each ID through the approved
account administration process. Do not read or export production password values.
Include any credentials reused outside this application in the incident response.
Treat the database connection credentials exposed in legacy helpers as compromised
until separately reviewed and rotated by their owners. Staff resets do not rotate
database credentials, signing secrets or provider keys.

## Secure mechanism

The existing bcrypt authentication framework is retained. No schema migration or
plaintext-to-hash web-request migration is introduced. Credential security state
and audit references use the existing JSONB user metadata. Verify that target
metadata has the expected object shape before rollout; do not repair it implicitly.

In the later separately authorized production configuration window, enable the
credential-remediation execution gate only for the approved account IDs:

- `PRODUCTION_CREDENTIAL_REMEDIATION_AUTHORIZED=true`
- `CREDENTIAL_ROTATION_ACCOUNT_IDS=<approved exact IDs, comma separated>`
- `CREDENTIAL_ROTATION_AUTHORIZATION_REF=<recorded approval reference>`

These settings have NOT been applied. They are distinct from web/worker startup
safety flags and do not authorize publication or arbitrary account changes.
All reset administration requires a current authenticated admin/GM operator; a
consultant or branch manager cannot reset another account, including within their
own branch. Branch names are never identity keys for this operation.

## Per-account procedure

1. Confirm recovery/PITR evidence, current source identity, maintenance notice and
   verified account owner/role/branch. Record only the safe account ID, username,
   approving actor ID, time and audit reference. Never include credentials.
2. For preview use authenticated `POST /api/auth/credential-security` with
   `action=revoke-sessions`, the exact `accountIds`, and `dryRun=true`. The response
   lists safe account IDs only. A dry run does not revoke anything.
3. In Admin → staff accounts → Reset Password, generate a unique temporary password
   with the browser cryptographic generator. It is held only in component memory,
   shown masked and optionally copied for private delivery. Verify the owner's
   private delivery channel before confirming. Never use email reports, chat,
   screenshots, shell arguments, console logs or shared files to carry it.
4. The operator's authenticated issue-reset operation stores only a SHA-256 digest
   of a 256-bit random token with a 15-minute expiry. The private response carries
   the raw token only to the authorized requester. Issuing a later token supersedes
   an earlier unconsumed token.
5. The UI consumes the token to set the temporary password. Consumption locks the
   exact account row, verifies expiry/hash, deletes the reset state, writes a
   bcrypt cost-12 hash, increments the account session version and requires
   first-login replacement. Concurrent consumption/replay cannot rotate twice.
   The operator-issued and consumed events retain actor/time/audit references.
6. Deliver the unique temporary credential privately to the verified owner. If
   delivery fails, issue a new reset; do not reuse a copied credential from a log.
7. Verify the old password fails using a private, unrecorded login attempt by the
   owner. Never ask the agent to collect the old password. An old affected session
   must fail; a session belonging to an unrelated account must remain valid.
8. The temporary credential permits one login to the restricted password-change
   session. Ordinary business APIs are denied until replacement. A repeated
   temporary login fails. If that restricted session is lost, an authorized
   operator must issue another reset rather than bypass the restriction.
9. The owner enters the current temporary password and a different permanent
   password (at least 12 characters, at most 72 UTF-8 bytes). This increments the
   session version again, invalidates the temporary session and signs the owner
   out. Verify temporary credentials fail and permanent credentials succeed.
10. Check current role/branch enforcement, not stale JWT claims; verify normal
    authorized staff work in the approved verification scope. Record status,
    account ID, actor ID, timestamp and audit reference only.
11. After all approved accounts are verified, close the separately approved
    credential execution gate. Record closure without exporting configuration
    secrets. Never enable a worker or scheduler as part of rotation.

## Emergency recovery

Do NOT restore exposed passwords, old signing keys, reset tokens or old sessions.
If the owner is locked out, use a newly authorized reset with a new cryptographic
token and a new unique temporary password, or keep the affected account disabled
until verified recovery. Revoke only the affected account IDs. Preserve audit
history. A raw historical application commit containing credentials or automatic
bootstrap is not an acceptable rollback target.

No automatic backdoor, privileged bootstrap account, password printout, or
plaintext migration is available. If an authorized operator cannot authenticate,
stop for a separately reviewed account-recovery operation; do not seed an admin.
