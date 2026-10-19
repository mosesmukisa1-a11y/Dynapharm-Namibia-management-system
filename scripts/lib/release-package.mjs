import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateReleaseIdentity} from '../../api/services/releaseStatus.js';
export const schemaFile = 'api/services/startupSchema.js';
const sha = b=>createHash('sha256').update(b).digest('hex');
export async function releaseBinding(archive, manifest) {
  if (sha(await fs.readFile(archive)) !== manifest.archiveSha256) throw Error('RELEASE_ARCHIVE_MISMATCH');
  return {identity:validateReleaseIdentity({buildDigest:manifest.archiveSha256,
    schemaContractDigest:manifest.files[schemaFile]}), files:manifest.files};
}
export async function injectReleaseIdentity(root, binding) {
  const identity=validateReleaseIdentity(binding.identity);
  if (!binding.files || binding.files[schemaFile]!==identity.schemaContractDigest ||
      !binding.files['server.js'] || !binding.files['package-lock.json'])
    throw Error('RELEASE_BINDING_INVALID');
  for(const [name,expected] of Object.entries(binding.files)) {
    if(path.isAbsolute(name)||name.split('/').some(p=>p==='..'||p==='')||
      name.includes('\\')||name.includes('\0')||! /^[a-f0-9]{64}$/.test(expected))
      throw Error('RELEASE_BINDING_INVALID');
    const file=path.join(root,name);
    if(!(await fs.lstat(file)).isFile() ||
      !(await fs.realpath(file)).startsWith(await fs.realpath(root)+path.sep) ||
      sha(await fs.readFile(file))!==expected) throw Error('RELEASE_SOURCE_MISMATCH');
  }
  // Derived output deliberately outside the hashed source archive: no self-hash cycle.
  const output=path.join(root,'.release-identity.json'),text=JSON.stringify(identity);
  try {
    if(await fs.readFile(output,'utf8')!==text) throw Error('RELEASE_IDENTITY_CONFLICT');
  } catch(error) {
    if(error.code!=='ENOENT')throw error;
    await fs.writeFile(output,text,{mode:0o444,flag:'wx'});
  }
  return identity;
}

export function releaseIdentityBuildPlugin(root) {
  return {name:'verified-release-identity',apply:'build',async buildStart() {
    try {
      await injectReleaseIdentity(root,JSON.parse(await fs.readFile(path.join(root,'.release-binding.json'),'utf8')));
    } catch {
      throw Error('RELEASE_BUILD_BINDING_FAILED');
    }
  }};
}
