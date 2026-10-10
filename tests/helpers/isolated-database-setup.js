import {assertIsolatedTestDatabase} from '../../api/testDatabaseGuard.js';

// Fail before importing the spec, so neither fixture setup nor cleanup can write.
assertIsolatedTestDatabase();
