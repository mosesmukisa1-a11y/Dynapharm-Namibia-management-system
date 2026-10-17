"""Value-free credential inventory. Scans tracked files and reachable Git blobs.

No ignored evidence, environment values, network, or database access.
Fingerprints are HMACs with an ephemeral key, not crackable password digests.
"""
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import subprocess

OUT = Path("generated-artifacts/security-remediation")
KEY = os.urandom(32)
PATTERNS = [
    ("credential_literal", re.compile(
        r"""(?i)\b(?:password|passwd|pwd|defaultPassword|seedPassword|AUTH_SECRET|JWT_SECRET|SESSION_SECRET|api[_-]?key|secret)\b['"]?\s*[:=]\s*(['"`])([^'"`\n]{3,})\1""")),
    ("credential_uri", re.compile(
        r"""(?i)(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|https?)://[^/\s:'"]+:[^@\s'"]+@[^'"\s]+""")),
    ("provider_key", re.compile(r"\b(?:re_[A-Za-z0-9]{20,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{30,})\b")),
    ("private_key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("bcrypt_literal", re.compile(r"\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}")),
    ("hash_literal_input", re.compile(r"""(?:bcrypt(?:Mod)?(?:\.default)?\.)?hash(?:Sync)?\(\s*(['"])([^'"\n]{3,})\1""")),
    ("sql_password_literal", re.compile(r"""(?i)(?:password_hash|password)\s*=\s*'([^'\n]{3,})'""")),
]


def git(*args):
    return subprocess.check_output(["git", *args])


def findings(data):
    if b"\0" in data or len(data) > 8_000_000:
        return []
    text = data.decode("utf-8", "replace")
    rows = []
    for category, pattern in PATTERNS:
        for match in pattern.finditer(text):
            raw = match.group(0)
            # No raw match, surrounding text, or stable password hashes leave memory.
            rows.append({
                "line": text.count("\n", 0, match.start()) + 1,
                "category": category,
                "fingerprint": hmac.new(KEY, raw.encode(), hashlib.sha256).hexdigest()[:20],
            })
    return rows


def classify(path, row, data, production=False):
    line = data.decode("utf-8", "replace").splitlines()[row["line"] - 1]
    # Reviewed UI error strings / property names, not authentication material.
    if row["category"] == "credential_literal" and (
        "alert(" in line or "showToast(" in line or "placeholder=" in line
        or "prompt(" in line or "error:" in line or "toThrow(" in line
    ):
        return "FALSE_POSITIVE"
    if path == "setup-local-database.sh" and re.search(r"localhost|YOUR_|your_|password.*host|user.*password", line, re.I):
        return "TEST_PLACEHOLDER"
    if path in {"tests/helpers/price-ui-fixtures.mjs", "tests/safe-stock-smoke.unit.test.js",
                "scripts/capture-distribution-ui.mjs", "scripts/check-stock-cleanup-readonly.mjs",
                "scripts/seed-sale-evidence-ui.mjs", "scripts/verify-isolated-gm-stock-bulk.mjs"}:
        return "TEST_PLACEHOLDER"
    return "ACTIVE_PRODUCTION_EXPOSURE" if production else None


def scan():
    OUT.mkdir(parents=True, exist_ok=True)
    head = git("rev-parse", "HEAD").decode().strip()
    tracked = git("ls-files", "-z").decode().split("\0")
    # Explicit new candidate source, not arbitrary untracked user attachments.
    for extra in ["api/services/credentialSecurity.js", "api/auth/credential-security.js",
                  "client/src/components/RequiredPasswordChange.jsx",
                  "scripts/audit-credential-exposure.py", "scripts/security-browser-rehearsal.mjs",
                  "tests/credential-security.spec.js", "tests/credential-security.unit.test.js"]:
        if extra not in tracked and Path(extra).exists():
            tracked.append(extra)
    current = []
    for name in filter(None, tracked):
        path = Path(name)
        if path.is_file() and not path.is_symlink():
            current.extend(dict(row, path=name, classification=classify(name, row, path.read_bytes()) or "CURRENT_SOURCE_EXPOSURE")
                           for row in findings(path.read_bytes()))
    historical = []
    production = []
    production_tree = "6f0efcc00e40e962ede9909f9bc5ed7433c37ec0"
    production_available = subprocess.run(["git", "cat-file", "-e", production_tree],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
    if production_available:
        for entry in git("ls-tree", "-r", "-z", production_tree).split(b"\0"):
            if not entry:
                continue
            meta, name = entry.split(b"\t", 1)
            _, kind, oid = meta.decode().split()
            if kind != "blob":
                continue
            data = git("cat-file", "blob", oid)
            path = name.decode("utf-8", "replace")
            production.extend(dict(row, path=path, blob=oid,
                classification=classify(path,row,data,True))
                for row in findings(data))
    # rev-list --objects --all includes all local branches/tags, not only HEAD.
    objects = git("rev-list", "--objects", "--all").decode().splitlines()
    proc = subprocess.Popen(["git", "cat-file", "--batch"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    scanned = 0
    for entry in objects:
        parts = entry.split(" ", 1)
        oid, name = parts[0], parts[1] if len(parts) > 1 else ""
        proc.stdin.write((oid + "\n").encode())
        proc.stdin.flush()
        header = proc.stdout.readline().decode().split()
        if len(header) != 3:
            raise RuntimeError("Incomplete Git object traversal; no values printed")
        _, kind, size = header
        data = proc.stdout.read(int(size))
        proc.stdout.read(1)
        if kind != "blob":
            continue
        scanned += 1
        historical.extend(dict(row, path=name or "(unlabelled blob)", blob=oid,
                               classification=classify(name,row,data) or "HISTORICAL_ONLY_EXPOSURE")
                          for row in findings(data))
    proc.stdin.close()
    proc.wait()
    result = {"head": head, "trackedFiles": len(list(filter(None, tracked))),
              "reachableBlobsScanned": scanned, "current": current, "historical": historical,
              "ownerSuppliedProductionTreeLocallyAvailable":production_available,
              "productionSnapshot":production,
              "limitations": "Heuristic candidates require review. No production database inspected. No ignored evidence scanned. No Git rewrite. Ephemeral keyed fingerprints are comparable within this run only."}
    (OUT / "exposure-candidates.json").write_text(json.dumps(result, indent=2))
    print(json.dumps({"trackedFiles": result["trackedFiles"], "reachableBlobsScanned": scanned,
                      "currentCandidates": len(current), "historicalCandidates": len(historical)}))


if __name__ == "__main__":
    scan()
