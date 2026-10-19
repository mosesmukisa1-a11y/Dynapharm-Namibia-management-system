import fs from 'node:fs';

const digest = /^[a-f0-9]{64}$/;
const keys = ['buildDigest', 'schemaContractDigest'];
export function validateReleaseIdentity(value) {
  if (!value || Object.keys(value).sort().join() !== [...keys].sort().join() ||
      keys.some(k => typeof value[k] !== 'string' || !digest.test(value[k])))
    throw new Error('RELEASE_IDENTITY_INVALID');
  return Object.freeze({buildDigest:value.buildDigest, schemaContractDigest:value.schemaContractDigest});
}

export function loadReleaseIdentity({required, read = () =>
  fs.readFileSync(new URL('../../.release-identity.json', import.meta.url), 'utf8')} = {}) {
  try {
    const text = read();
    if (text.length > 512) throw new Error();
    return validateReleaseIdentity(JSON.parse(text));
  } catch {
    if (required) throw new Error('RELEASE_IDENTITY_REQUIRED');
    return null;
  }
}

// Only this web instance's policy/readiness. Not an inventory of other services.
export function releaseStatus(identity, {startupMode, schedulerEnabled, workerEnabled, ready}) {
  const trusted = validateReleaseIdentity(identity);
  if (!['legacy','code-only'].includes(startupMode) ||
      [schedulerEnabled,workerEnabled,ready].some(v=>typeof v !== 'boolean'))
    throw new Error('RELEASE_STATE_INVALID');
  return Object.freeze({
    buildDigest:trusted.buildDigest, schemaContractDigest:trusted.schemaContractDigest,
    startupMode, schedulerState:schedulerEnabled?'enabled':'disabled',
    workerState:workerEnabled?'enabled':'disabled',
    readiness:ready?'ready':'not-ready',
  });
}

export function releaseStatusHandler(identity, state) {
  return (_req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    try {
      const result = releaseStatus(identity,state());
      return res.status(result.readiness==='ready'?200:503).json(result);
    } catch {
      // Unpackaged development has no identity; never invent a successful digest.
      return res.status(503).end();
    }
  };
}
