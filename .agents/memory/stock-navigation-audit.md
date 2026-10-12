---
name: Stock navigation audit boundaries
description: Evidence-based menu changes and safe treatment of legacy disposal records.
---
The stock portal must retain Dynapharm's red-and-white branding. Consolidation requires evidence that the retained destination covers complete workflows; a similar title, empty page or absent analytics is not evidence for removal.

**Why:** The user explicitly requested an all-tab audit before deciding what to remove and prohibited changing historical balances or disposal status merely to clean up navigation.

**How to apply:** Preserve old view IDs and distinguish rendering tests from transactions, permissions, filtered exports and reconnect behavior. Mark unexecuted checks NOT VERIFIED.

Legacy `dispose_off` is a disposal state, not proof of an Expired reason. A disposal acknowledgement must report changed records and must never repeat the stock deduction.

**Why:** Approval produced a state the disposal API did not accept; the UI displayed a blanket success after zero updates and labelled unrelated disposal records Expired.

**How to apply:** Keep movement IDs visible, investigate expiry/reason conflicts against original evidence, and never rewrite historical reasons or quantities automatically.
