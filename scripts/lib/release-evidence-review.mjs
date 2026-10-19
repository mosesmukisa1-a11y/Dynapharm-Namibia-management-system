// Pure offline review helpers. No environment, filesystem, driver or provider imports.
const digest = /^[a-f0-9]{64}$/;
const sourceSuffix = /\.(?:[cm]?[jt]sx?|py|sql|md|json|css|html|ya?ml|toml)$/;
export function isReviewSource(file) {
  if (typeof file !== 'string' || !file || file.includes('\\') || file.startsWith('/') ||
      file.split('/').some(p => !p || p === '.' || p === '..') ||
      /[\x00-\x1f]/.test(file)) return false;
  const parts = file.split('/');
  if (parts.some(p => /^(?:\.env.*|node_modules|generated-artifacts|attached_assets|uploads|dist|\.git|\.local|\.agents|\.cache)$|^(?:browser-private|credentials|service-account)(?:[./-]|$)/i.test(p))) return false;
  if (file === '.replit' || file === 'package.json' || file === 'package-lock.json') return true;
  if (file.endsWith('.json') && !/^tests\/fixtures\/.*(?:schema|contract).*\.json$/.test(file) &&
      file !== 'docs/b2-recovery-source-reply-template.json') return false;
  if (!sourceSuffix.test(file)) return false;
  if (parts.length === 1) return !file.endsWith('.json');
  return /^(?:api|src|scripts|worker|tests|docs|migrations|\.github)\//.test(file);
}

export function offlineAuditOutput(args) {
  if (!Array.isArray(args) || args.length > 1 ||
      args.some(a => typeof a !== 'string' ||
        !/^--output-dir=generated-artifacts\/[a-z0-9-]+\/[a-z0-9-]+$/.test(a)))
    throw Error('INVALID_OFFLINE_AUDIT_OUTPUT');
  return args.length ? args[0].slice('--output-dir='.length) : 'generated-artifacts/sql-runtime-enforcement-final';
}

export function isDeploymentSchemaSource(file) {
  return file === 'server.js' || /^(?:api\/migrations|api\/schema|migrations)\//.test(file) ||
    /^api\/.*(?:schema|migration)[^/]*\.(?:[cm]?js|sql)$/i.test(file);
}

export function compareSourceEvidence(expected, current) {
  if (!expected || !current || typeof expected !== 'object' || typeof current !== 'object' ||
      Array.isArray(expected) || Array.isArray(current)) throw Error('INVALID_SOURCE_MANIFEST');
  const changed = [], missing = [];
  for (const [file, hash] of Object.entries(expected)) {
    if (!isReviewSource(file) || !digest.test(hash)) throw Error('INVALID_SOURCE_REFERENCE');
    if (!Object.hasOwn(current, file)) missing.push(file);
    else if (!digest.test(current[file])) throw Error('INVALID_SOURCE_DIGEST');
    else if (current[file] !== hash) changed.push(file);
  }
  const added = Object.keys(current).filter(file => {
    if (!isReviewSource(file) || !digest.test(current[file])) throw Error('INVALID_SOURCE_REFERENCE');
    return !Object.hasOwn(expected, file);
  });
  return {status: Object.keys(expected).length && !changed.length && !missing.length && !added.length
    ? 'IDENTICAL_SOURCE_ONLY' : 'NOT_EXACT_CANDIDATE_EVIDENCE',
  changed: changed.sort(), missing: missing.sort(), added: added.sort(),
  provesArchiveOrCleanInstall: false, provesProduction: false};
}

export const recoveryReplyAssertions = Object.freeze([
  'directPostgres', 'physicalRecovery', 'transactionReadOnly', 'samePhysicalServer',
  'noPoolingOrReaderLoadBalancing', 'targetChangeAborts', 'tlsVerifyFull',
  'systemCaTrust', 'protectedBindingAvailable', 'twoSamePrincipalConnections',
  'ownSessionCatalogVisibility', 'exactOwnBackendCancellation',
  'noElevatedGrants', 'completeLogicalBackupVisibility'
]);
export function reviewRecoverySourceReply(reply, nowMs = Date.now()) {
  const missing = [];
  const ref = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/;
  const input = reply && typeof reply === 'object' && !Array.isArray(reply) ? reply : {};
  for (const field of ['productionResourceRef', 'recoveryResourceRef', 'providerAttestationRef']) {
    if (typeof input[field] !== 'string' || !ref.test(input[field])) missing.push(field);
  }
  if (input.productionResourceRef && input.productionResourceRef === input.recoveryResourceRef)
    missing.push('distinctPhysicalRecoveryResource');
  for (const field of recoveryReplyAssertions) if (input[field] !== true) missing.push(field);
  if (!Number.isInteger(input.engineMajor) || input.engineMajor < 12 || input.engineMajor > 99)
    missing.push('engineMajor');
  const observed = typeof input.observedAtUtc === 'string' && /Z$/.test(input.observedAtUtc)
    ? Date.parse(input.observedAtUtc) : NaN;
  const expiry = typeof input.validUntilUtc === 'string' && /Z$/.test(input.validUntilUtc)
    ? Date.parse(input.validUntilUtc) : NaN;
  if (!Number.isFinite(nowMs) || !Number.isFinite(observed) || observed > nowMs)
    missing.push('observationTime');
  if (!Number.isFinite(expiry) || expiry <= nowMs || expiry <= observed)
    missing.push('evidenceExpiry');
  if (input.changesPerformed !== false) missing.push('noProviderChanges');
  return {status: missing.length ? 'INFORMATION_INCOMPLETE' : 'INFORMATION_COMPLETE_FOR_OFFLINE_PLAN_REVIEW',
    missing: [...new Set(missing)], productionExecutionAllowed: false,
    sourceBindingEstablished: false,
    firstAction: 'OFFLINE_COMPARE_PROVIDER_ATTESTATION_WITH_OWNER_RESOURCE_EVIDENCE'};
}

export function offlineReleaseVerdict({b5Closed = false} = {}) {
  return {verdict: 'BLOCKED - DO NOT PUBLISH',
    blockers: {
      B1: 'CURRENT_PRODUCTION_IDENTITY_SCHEMA_AND_AUTH_EVIDENCE_REQUIRED',
      B2: 'RECOVERY_STORAGE_FALLBACK_AND_TIMING_UNPROVEN',
      B3: 'PRODUCTION_CREDENTIAL_CONTAINMENT_UNVERIFIED',
      B4: 'DEPLOYED_ARTIFACT_SERVICE_AND_JOB_OWNERSHIP_UNVERIFIED',
      B5: b5Closed ? 'CLOSED_OWNER_ATTESTED_EXISTING_EVIDENCE' : 'ACKNOWLEDGEMENT_EVIDENCE_REQUIRED',
      C1: 'EXACT_FINAL_ARCHIVE_CLEAN_GATE_AND_CURRENT_SECURITY_REVIEW_REQUIRED'
    }, productionExecutionAllowed: false};
}
