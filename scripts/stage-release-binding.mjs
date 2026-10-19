// Future owner-operated packaging step only. Local approved artifacts; no providers.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {releaseBinding,injectReleaseIdentity} from './lib/release-package.mjs';
const [archive,manifestPath,target,approvedArchive,approvedManifest,...extra]=process.argv.slice(2);
try {
  if(extra.length||![approvedArchive,approvedManifest].every(v=>/^[a-f0-9]{64}$/.test(v)))throw Error();
  const bytes=await fs.readFile(manifestPath);
  if(createHash('sha256').update(bytes).digest('hex')!==approvedManifest)throw Error();
  const manifest=JSON.parse(bytes);
  if(manifest.archiveSha256!==approvedArchive)throw Error();
  const binding=await releaseBinding(archive,manifest);
  await injectReleaseIdentity(target,binding);
  await fs.writeFile(path.join(target,'.release-binding.json'),JSON.stringify(binding),{mode:0o444,flag:'wx'});
  console.log('RELEASE_BINDING_STAGED');
} catch {
  console.error('RELEASE_BINDING_STAGE_FAILED');
  process.exitCode=1;
}
