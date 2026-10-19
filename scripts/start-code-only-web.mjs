import '../api/services/runtimeDiagnostics.js';
import {assertCodeOnlyWebProfile} from '../api/services/startupPolicy.js';
import {loadReleaseIdentity} from '../api/services/releaseStatus.js';
assertCodeOnlyWebProfile(process.env);
loadReleaseIdentity({required:true});
await import('../server.js');
