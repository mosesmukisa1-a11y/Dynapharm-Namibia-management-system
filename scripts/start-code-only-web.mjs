import '../api/services/runtimeDiagnostics.js';
import {assertCodeOnlyWebProfile} from '../api/services/startupPolicy.js';
assertCodeOnlyWebProfile(process.env);
await import('../server.js');
