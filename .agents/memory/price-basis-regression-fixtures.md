---
name: Price-basis regression fixtures
description: Design price-change tests that expose mistaken substitution between received value, sale DP and customer charge.
---
Use deliberately different received DPC, frozen sale DP, customer charge and
later catalogue price in reconciliation fixtures; inspect the actual downloaded
receipt bytes before and after a compensating price change.

**Why:** Equal-price fixtures concealed a receipt read path that replaced the
saved customer charge with today's DP. An inventory movement's original DPC
was also initially mistaken for the transaction DP in an audit assertion.
Matching numbers alone cannot establish that the right evidence was used.

**How to apply:** Preserve and compare each labelled basis independently.
Do not alter valid historical inventory values to make them match current
sale prices. Distinguish known original cost from complete import provenance,
and disclose unknown prescription customer charges rather than adding DP
records to customer-receipt totals.

Receipt assertions must independently check fractional cents, including zero,
rather than sharing a dashboard currency formatter with the implementation.

**Why:** A shared whole-dollar formatter can make a test pass while concealing
the loss of a captured fractional sale price in the receipt itself.

**How to apply:** Use explicit expected currency strings for known fixture
amounts, and compare frozen receipt bytes after catalogue changes. When checking
the browser, establish that it loaded current development source, not an older
static build served by another application port.
