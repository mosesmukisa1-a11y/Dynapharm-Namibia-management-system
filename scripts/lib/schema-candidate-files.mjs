import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
// Candidate migrations must be visible before a platform checkpoint tracks them.
export function eligibleUntrackedSchemaSource(file) {
  return typeof file==='string'&&/^(api|scripts|tests|migrations|backend|client|worker|src|shared|lib)\//.test(file);
}
// The owner clean-install copy intentionally has no .git directory. Its source
// inventory is tied to the already verified archive, not an invented schema.
export async function readVerifiedCandidateFiles(root) {
  let manifest;
  try{manifest=JSON.parse(await fs.readFile(path.join(root,'.verified-candidate-source.json'),'utf8'));}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
  if(!manifest?.files||typeof manifest.files!=='object'||Array.isArray(manifest.files))
    throw Error('Invalid candidate source manifest');
  const realRoot=await fs.realpath(root);
  const files=[];
  for(const[file,expected]of Object.entries(manifest.files)){
    if(path.isAbsolute(file)||file.split('/').includes('..')||file.includes('\0'))
      throw Error('Unsafe candidate source path');
    if(!/\.(?:sql|js|mjs|jsx|ts)$/.test(file))continue;
    if(!/^[a-f0-9]{64}$/.test(expected)||!(await fs.lstat(path.join(root,file))).isFile())
      throw Error('Invalid candidate source file');
    if(!(await fs.realpath(path.join(root,file))).startsWith(realRoot+path.sep))
      throw Error('Unsafe candidate source symlink');
    const actual=createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');
    if(actual!==expected)throw Error('Candidate source hash mismatch');
    files.push(file);
  }
  return files;
}
