import pg from 'pg';
import {installTestConnectionGuard} from '../../api/testDatabaseGuard.js';

installTestConnectionGuard(pg);
