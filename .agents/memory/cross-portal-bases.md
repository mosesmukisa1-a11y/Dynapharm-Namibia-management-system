---
name: Cross-portal calculation bases
description: Keep DP, customer receipts, original charged revenue and estimated cost distinct during reconciliation.
---

Reconcile only equal scopes, dates and calculation bases. Keep DP revenue, customer receipts and matched original charged revenue separately labelled; keep estimated/current-price costs separate from original received-cost evidence.

**Why:** The user explicitly requires these distinctions. A precisely formatted estimate can coexist with correctly incomplete original-evidence profit; forcing the figures to agree hides missing evidence.

**How to apply:** Share calculations only where scope and basis match. Propagate missing-evidence counts/completeness flags. Never merge location or employee identities based on matching names alone; historical mappings need independent evidence.

Saved commercial sale DP and original received DPC are different business values,
even when older interfaces call both “DP”. Charged minus commercial DP is
commercial branch margin, not actual received-cost profit. A legitimate zero
must remain zero; an uncaptured price is incomplete.

**Why:** The user specified a sale charged at N$443 with commercial DP N$341 and
commercial margin N$102, while insisting that original received-cost valuation
and actual profit remain independent. Changing the catalogue must not reprice
that historical sale.

**How to apply:** Carry captured commercial and cost bases separately through
audits, movements, reports, prints and repair tools. Never use today's catalogue
or customer cash to fill an unknown historical DP.

Captured commercial DP is already net of its original campaign discount.
Refund DP is that saved unit DP multiplied by the returned quantity, including
for members; the cash refund remains a separate value.

**Why:** Applying the discount again makes a full return leave fictitious net
DP revenue (a captured 90 from a 10%-off 100 sale must reverse 90, not 81).

**How to apply:** Gross/net DP reports must consume the original allocation or
its exact reversal snapshot without another discount or customer-type price
substitution. Missing saved DP stays incomplete.

Company-wide administrative previews do not waive branch-specific endpoint safeguards. Aggregate explicitly scoped authorized reads and retain per-section completeness, rather than weakening server authority.

**Why:** The user requires the explicit-branch protection to remain: unscoped administrative reads risk appearing under the wrong branch, while swallowed failures can present unavailable financial data as zero.

**How to apply:** Keep successful branch subsets separate from company totals, name unavailable branches only where permitted, and retry the affected read section. Respect each endpoint's actual branch parameter contract; a company-wide UI label is not new server authority.
