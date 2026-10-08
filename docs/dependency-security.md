# Dependency security and compatibility

Both dependency trees (the main app and standalone realtime gateway) were
updated. Use their committed lockfiles for reproducible installs. Development
dependencies are included so the frontend build and security regression tests
are available after installation.

## Compatibility choices

- Tailwind 4 and Chokidar 4 remove `braces`, for which no patched release was
  available. The existing Tailwind theme is loaded through `@config`; base border,
  cursor, small shadow, radius and blur defaults preserve existing portal styles.
- React Router 7 contains the navigation/hydration fixes that were not all
  backported to version 6. The app continues using its existing declarative
  `BrowserRouter`, `Routes` and `Route` interfaces.
- PDF.js is pinned to the unaffected `5.5.207` release, including the GM browser
  CDN loader. The advisory affects `>=5.6.83 <6.2.108`. Version 6 requires Node 22,
  whereas this project runs Node 20. The server's `pdf-parse` dependency uses the
  unaffected `5.4.296` release.
- Google Cloud Storage's compatible version 7 still pulls older UUID ranges.
  The UUID 11 override is necessary because the newer storage major requires
  Node 22. UUID 11 retains CommonJS and the `v4` interface used by those parents;
  regression tests check those imports.

## SheetJS audit discrepancy

SheetJS's npm `xlsx` release remains at the vulnerable `0.18.5`. This project
instead installs **0.20.3 from the official SheetJS CDN**, pinned by URL and
lockfile integrity.

The OSV scanner still reports these two advisories for 0.20.3 because its npm
affected ranges have an introduction at `0` and no fixed-version bound:

| Advisory | Actual upstream fixed release |
| --- | --- |
| GHSA-4r6h-8v6p-xvw6 (prototype pollution) | 0.19.3 |
| GHSA-5pgg-2g8v-p4x9 (regular-expression DoS) | 0.20.2 |

The advisory descriptions explicitly state that patched releases are available
from the SheetJS CDN, not npm:

- https://github.com/advisories/GHSA-4r6h-8v6p-xvw6
- https://github.com/advisories/GHSA-5pgg-2g8v-p4x9
- https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz

These are scanner false positives for the installed release, **not unpatched
findings or ignored vulnerabilities**. No scanner exclusions were added.
Keep checking the installed version against upstream advisories; do not broadly
suppress future SheetJS findings. This choice preserves the existing CSV,
legacy `.xls`, and `.xlsx` import/export features.

## Verification

- `npm audit` and `npm audit --prefix realtime-gateway`: no vulnerabilities.
- `npm test`: existing tests plus dependency-floor, cookie, upload-size,
  spreadsheet-format, PDF-extraction and UUID compatibility regressions.
- `npm run build`: production frontend build.
- Public page and login UI checked in the preview. Signed-in portal UI requires
  authentication and is not covered by the screenshot check.
