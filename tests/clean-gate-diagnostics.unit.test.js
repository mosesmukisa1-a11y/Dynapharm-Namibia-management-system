import {describe,it,expect} from 'vitest';
import {safeFailure,sourcePath} from '../scripts/lib/clean-gate-diagnostics.mjs';
describe('allowlisted clean-install diagnostics',()=>{
  it('keeps missing fixture filename and source stack location without exception values',()=>{
    const result=safeFailure("Error: ENOENT: no such file, open 'generated-artifacts/stock-audit/lifecycle-results.json'\n"+
      "    at save (/tmp/owned/source/tests/stock-lifecycle-end-to-end.spec.js:90:3)\n"+
      'PRIVATE_CANARY_VALUE postgresql://private:private@private/db');
    expect(result.codes).toContain('ENOENT');
    expect(result.missingPaths).toEqual(['generated-artifacts/stock-audit/lifecycle-results.json']);
    expect(result.frames).toEqual([{file:'tests/stock-lifecycle-end-to-end.spec.js',line:90,column:3}]);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_CANARY|postgresql|private@/);
  });
  it('keeps missing package and error category',()=>{
    expect(safeFailure("ERR_MODULE_NOT_FOUND: Cannot find package 'missing-package' imported from /tmp/source/scripts/test.mjs"))
      .toMatchObject({categories:['missingModule'],codes:['ERR_MODULE_NOT_FOUND'],missingPaths:['missing-package']});
  });
  it('does not keep arbitrary business values or unsafe paths',()=>{
    const result=safeFailure("AssertionError: expected CLIENT_PRIVATE to equal PAYMENT_PRIVATE; password=TOKEN_PRIVATE");
    expect(result.categories).toEqual(['assertion']);
    expect(JSON.stringify(result)).not.toMatch(/CLIENT_PRIVATE|PAYMENT_PRIVATE|TOKEN_PRIVATE/);
    expect(sourcePath('/private/password.key')).toBeNull();
    expect(sourcePath('postgresql://owner:secret@host/db')).toBeNull();
  });
});
