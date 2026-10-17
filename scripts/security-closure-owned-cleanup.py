"""Remove only a positively recorded cluster from this remediation run.
No database connection or catalogue query; no default/shared service is touched.
"""
import hashlib,json,os,signal,subprocess,time,shutil,socket,errno
from pathlib import Path
out=Path('generated-artifacts/security-remediation-closure')
results=[]
for file in (out/'fixture-runs').glob('*.json'):
    if file.name.endswith('-cleanup.json'):
        continue
    owner=json.loads(file.read_text())
    directory=Path(owner['clusterDirectory'])
    if not directory.exists():
        continue
    assert owner['cleanupOwner']=='security-closure-fixture' and owner['disposable'] and not owner['production']
    assert directory.is_absolute() and directory.parent==Path('/tmp') and directory.name.startswith('security-closure-')
    pidfile=directory/'data/postmaster.pid'
    assert pidfile.exists()
    lines=pidfile.read_text().splitlines()
    assert lines[1]==str(directory/'data')
    fingerprint=hashlib.sha256(('127.0.0.1:'+lines[3]).encode()).hexdigest()
    assert fingerprint==owner['hostFingerprint']
    postgres_pid=int(lines[0])
    process_file=Path(f'/proc/{postgres_pid}/cmdline')
    running=process_file.exists()
    if running:
        args=process_file.read_bytes().split(b'\0')
        assert str(directory/'data').encode() in args
    else:
        # A dead fixture can leave a stale postmaster.pid. Prove both of its
        # recorded transports refuse connections before removing owned files.
        for family,address in [(socket.AF_INET,('127.0.0.1',int(lines[3]))),
          (socket.AF_UNIX,str(directory/f'.s.PGSQL.{lines[3]}'))]:
            with socket.socket(family,socket.SOCK_STREAM) as probe:
                probe.settimeout(1)
                try:
                    probe.connect(address)
                    raise AssertionError('Owned transport still accepts connections; preserve files')
                except OSError as error:
                    assert error.errno in {errno.ECONNREFUSED,errno.ENOENT}
    stopped=[]
    for proc in Path('/proc').iterdir():
        if not proc.name.isdigit():continue
        try:
            command=(proc/'cmdline').read_bytes().split(b'\0')
        except (FileNotFoundError,PermissionError,ProcessLookupError):
            continue
        if str(directory/'entry.mjs').encode() in command and b'node' in Path(os.fsdecode(command[0])).name.encode():
            os.kill(int(proc.name),signal.SIGTERM)
            stopped.append(int(proc.name))
    if running:
        subprocess.run(['pg_ctl','-D',str(directory/'data'),'-m','fast','-w','stop'],
          check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    shutil.rmtree(directory)
    result={'database':owner['database'],'hostFingerprint':fingerprint,
      'cleanupVerified':True,'cleanedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
      'ownershipProof':'recorded exact data directory and port fingerprint; live PID command match or dead PID plus refused TCP and Unix transports',
      'ownedChildPidsStopped':stopped,'productionModified':False}
    (out/'fixture-runs'/f"{owner['database']}-cleanup.json").write_text(json.dumps(result,indent=2))
    results.append(result)
(out/'owned-residual-cleanup.json').write_text(json.dumps(results,indent=2))
print('Positively owned residual clusters removed:',len(results),'; ambiguous older candidates untouched.')
