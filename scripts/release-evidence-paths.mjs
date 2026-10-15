import path from 'node:path';
export const releaseEvidenceRoot=process.env.STOCK_RELEASE_EVIDENCE_ROOT || 'generated-artifacts/final-release-gate';
const allowed=path.resolve('generated-artifacts/final-release-gate');
const selected=path.resolve(releaseEvidenceRoot);
const operational=path.resolve('generated-artifacts/final-operational-gate');
if(![allowed,operational].some(root=>selected===root||selected.startsWith(root+path.sep)))throw Error('Release evidence must remain inside a dedicated release evidence directory');
export const releaseBrowserEvidence=releaseEvidenceRoot+'/browser-evidence';
