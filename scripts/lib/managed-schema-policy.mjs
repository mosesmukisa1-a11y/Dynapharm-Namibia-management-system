import {scope,queries,querySpec} from './production-schema-policy.mjs';
export {scope};
export const identitySql=`SELECT pg_catalog.json_build_object(
  'databaseIdentityFingerprint',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.current_database() || $1::text,'UTF8')),'hex'),
  'sessionReadOnly',pg_catalog.current_setting('default_transaction_read_only'),
  'transactionReadOnly',pg_catalog.current_setting('transaction_read_only'),
  'statementTimeout',pg_catalog.current_setting('statement_timeout'),
  'lockTimeout',pg_catalog.current_setting('lock_timeout'),
  'serverTimestamp',pg_catalog.statement_timestamp(),
  'inRecovery',pg_catalog.pg_is_in_recovery()
) AS metadata_identity`;
export function requireManagedReadOnly(identity) {
  if(identity?.sessionReadOnly!=='on'||identity?.transactionReadOnly!=='on')
    throw Error('MANAGED_READ_ONLY_FLAGS_NOT_ON');
  if(!/^[a-f0-9]{64}$/.test(identity.databaseIdentityFingerprint||''))
    throw Error('MANAGED_IDENTITY_INVALID');
}
export function managedSpec(id,object) {
  if(!Object.hasOwn(queries,id))throw Error('Not a managed catalog query ID');
  return querySpec(id,object);
}
export const metadataIds=Object.freeze(Object.keys(queries));
