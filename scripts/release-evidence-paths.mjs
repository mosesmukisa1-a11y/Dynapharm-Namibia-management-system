import path from 'node:path';
export const releaseEvidenceRoot=process.env.STOCK_RELEASE_EVIDENCE_ROOT || 'generated-artifacts/final-release-gate';
const allowed=path.resolve('generated-artifacts/final-release-gate');
const selected=path.resolve(releaseEvidenceRoot);
if(selected!==allowed&&!selected.startsWith(allowed+path.sep))throw Error('Release evidence must remain inside the dedicated generated-artifacts directory');
export const releaseBrowserEvidence=releaseEvidenceRoot+'/browser-evidence';
