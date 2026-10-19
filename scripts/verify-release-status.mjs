// Opt-in operator command; no default URL and no credential/session input.
import {verifyReleaseStatus} from './lib/verify-release-status.mjs';
const [origin,buildDigest,schemaContractDigest,...extra]=process.argv.slice(2);
const result=extra.length?{status:'FAIL',code:'RELEASE_VERIFICATION_FAILED'}:
  await verifyReleaseStatus({origin,expected:{buildDigest,schemaContractDigest}});
console.log(JSON.stringify(result));
if(result.status!=='PASS')process.exitCode=1;
