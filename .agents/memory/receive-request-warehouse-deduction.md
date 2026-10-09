---
name: receive-request warehouse deduction
description: Source deductions must be linked to dispatch evidence, never inferred from a shortfall.
---

## Rule
Receiving a linked dispatch must not deduct its source a second time. A legacy request without dispatch evidence must have sufficient verified source stock; a shortfall is not proof that stock was previously dispatched.

**Why:** The user-approved lifecycle requires exactly one source deduction and staff-confirmed actual receipt. Earlier best-effort deduction could credit a branch despite an unexplained source shortage.

**How to apply:** Resolve the persisted dispatch and warehouse ownership first, and use the common receipt operation when linked. Reject unexplained shortages rather than inventing destination stock. Do not reinstate the old blanket best-effort exception.
