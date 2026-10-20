---
name: Dependency audit caveats
description: Why patched official SheetJS releases can still appear vulnerable in npm-oriented scanners.
---

Use official patched SheetJS distributions while preserving CSV, legacy `.xls`,
and `.xlsx` support; do not replace them with an `.xlsx`-only library merely to
make a scanner result disappear.

**Why:** The npm `xlsx` package stopped publishing updates. Its OSV advisories
have unbounded affected ranges even though their descriptions identify patched
releases on the official CDN. A newer official release can therefore be reported
as vulnerable after the actual flaws have been fixed.

**How to apply:** Check the installed distribution and version against the
upstream advisory's real fixed release. Document scanner discrepancies honestly
and do not add broad exclusions that would hide future, genuine vulnerabilities.

Keep direct scanner results separate from the Security pane and publication
enforcement.

**Why:** Owner-supplied UI evidence displayed two older dependency findings while
fresh scanner callbacks returned additional static findings. Callback results
alone did not establish the pane's state or an actual publication rejection.

**How to apply:** Label each evidence source and timestamp; never infer provider
gate failure or synchronization from raw scan counts. Preserve the safeguard.
