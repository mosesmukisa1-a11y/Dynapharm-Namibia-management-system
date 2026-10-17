"""Disposable candidate source copy only. Never installs or exports it."""
import hashlib,json,os,shutil,subprocess,tempfile
from pathlib import Path
root=Path.cwd()
out=root/'generated-artifacts/security-remediation-closure'
files=subprocess.check_output(['git','ls-files','-z']).decode().split('\0')
new=subprocess.check_output(['git','ls-files','--others','--exclude-standard','-z']).decode().split('\0')
excluded={'.git','node_modules','generated-artifacts','attached_assets','.local','.agents','.cache','dist','uploads'}
temporary=Path(tempfile.mkdtemp(prefix='security-source-candidate-'))
lock=hashlib.sha256((root/'package-lock.json').read_bytes()).hexdigest()
count=0
try:
    for name in sorted(set(files+new)):
        p=Path(name)
        if not name or p.parts[0] in excluded or any(x.startswith('.env') for x in p.parts):
            continue
        if p.suffix in {'.log','.db','.sqlite','.dump','.zip','.tar','.gz'} or not p.is_file():
            continue
        if 'private' in p.name.lower() or p.name=='.replit.security-candidate':
            continue
        destination=temporary/p
        destination.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(root/p,destination)
        count+=1
    assert not (temporary/'node_modules').exists()
    copy_hash=hashlib.sha256((temporary/'package-lock.json').read_bytes()).hexdigest()
    assert lock==copy_hash
    result={'status':'NOT VERIFIED','candidateLockfileSha256':lock,'copyLockfileSha256':copy_hash,
      'lockfileMatches':True,'sourceFilesCopied':count,'existingNodeModulesCopied':False,
      'installationAttempted':False,'dependenciesChanged':False,
      'reason':'Permitted managed package interface has no cwd/lockfile-only clean-install operation. Shell package installation is not permitted. No existing-dependency build substituted.',
      'followingCleanCopyStages':'NOT VERIFIED: build, startup contracts, unit/database suites and strict startup cannot be run without a genuine clean dependency installation.'}
finally:
    shutil.rmtree(temporary)
result['disposableSourceCopyRemoved']=not temporary.exists()
(out/'clean-install.json').write_text(json.dumps(result,indent=2))
print('Disposable source copy removed; clean installation NOT VERIFIED.')
