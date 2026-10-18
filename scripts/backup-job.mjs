#!/usr/bin/env node
// Manual entrypoint only. Not imported by application startup or any scheduler.
import {pathToFileURL} from 'node:url';
import {runBackup} from './lib/backup-job.mjs';
import {validateLocalConfiguration} from './lib/backup-local-validation.mjs';

export async function main(args = process.argv.slice(2), env = process.env) {
  const result = await runBackup({
    args, env,
    validateLocal: validateLocalConfiguration,
    emit: record => console.log(JSON.stringify(record)),
    loadIO: async context => {
      const {createBackupIO} = await import('./lib/backup-job-io.mjs');
      return createBackupIO(context);
    },
  });
  console.log(JSON.stringify({event: 'b2.backup.result', ...result}));
  return result.status === 'FAILED' ? 1 : result.configurationValid === false ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
