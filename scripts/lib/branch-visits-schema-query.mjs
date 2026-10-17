// Fixed catalog SELECT derived from the retained reviewed metadata grammar.
// Only this table and its directly attached trigger functions are selected.
import assert from 'node:assert/strict';
import {consolidatedSql} from './consolidated-schema-query.mjs';
export const branchVisitsQueryId='branch-client-visits-authority-v1';
export const branchVisitsParams=['public','branch_client_visits'];
const requested="(VALUES($2::text),($3::text),($4::text),($5::text),($6::text),($7::text),($8::text))";
const functions="((n.nspname=$1::text AND p.proname=$9::text)\n   OR p.oid IN (SELECT tgfoid FROM triggers WHERE NOT tgisinternal))";
assert(consolidatedSql.includes(requested)&&consolidatedSql.includes(functions));
export const branchVisitsSql=consolidatedSql
  .replace(requested,'(VALUES($2::text))')
  .replace(functions,'p.oid IN (SELECT tgfoid FROM triggers WHERE NOT tgisinternal)');
assert(!/\$[3-9]\b/.test(branchVisitsSql));
