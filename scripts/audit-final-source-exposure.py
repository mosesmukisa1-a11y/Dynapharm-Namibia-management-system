"""Offline value-free current/reachable-Git source exposure inventory."""
from pathlib import Path
import importlib.util, json, subprocess
from datetime import datetime, timezone

BASE = Path("generated-artifacts/sql-security-final-closure")
spec = importlib.util.spec_from_file_location("offline_source_audit", "scripts/audit-credential-exposure.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)  # Does not invoke its __main__ scan or production-tree inspection.
manifest = json.loads((BASE / "review-source-manifest.json").read_text())
current, historical = [], []

def eligible(name):
    p = Path(name)
    return bool(name) and not name.startswith((
        "generated-artifacts/", "attached_assets/", "uploads/", "backend/dynapharm_data/",
        ".agents/", ".local/", ".cache/", "node_modules/", "dist/",
    )) and not any(x.startswith(".env") for x in p.parts) and (
        p.suffix in {".js", ".mjs", ".jsx", ".cjs", ".ts", ".tsx", ".py", ".sql", ".md", ".html", ".css", ".yml", ".yaml"}
        or name in {"package.json", "package-lock.json", ".replit"}
        or name.startswith("tests/fixtures/") and p.suffix == ".json"
    )

for name, expected in manifest["sourceFiles"].items():
    if not eligible(name):
        continue
    data = Path(name).read_bytes()
    if audit.hashlib.sha256(data).hexdigest() != expected:
        raise RuntimeError("Review source changed; no exposure values printed")
    current.extend(dict(row, path=name, classification=audit.classify(name, row, data))
                   for row in audit.findings(data))

objects = audit.git("rev-list", "--objects", "--all").decode().splitlines()
proc = subprocess.Popen(["git", "cat-file", "--batch"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
scanned, skipped = 0, 0
try:
    for entry in objects:
        parts = entry.split(" ", 1)
        oid, name = parts[0], parts[1] if len(parts) > 1 else ""
        if not eligible(name):
            skipped += 1
            continue
        proc.stdin.write((oid + "\n").encode())
        proc.stdin.flush()
        header = proc.stdout.readline().decode().split()
        if len(header) != 3:
            raise RuntimeError("Incomplete offline Git traversal; no values printed")
        _, kind, size = header
        data = proc.stdout.read(int(size))
        proc.stdout.read(1)
        if kind != "blob":
            continue
        scanned += 1
        historical.extend(dict(row, path=name, blob=oid,
                               classification=audit.classify(name, row, data) or "HISTORICAL_ONLY_EXPOSURE")
                          for row in audit.findings(data))
finally:
    proc.stdin.close()
    proc.wait()

result = {
    "recordedAt": datetime.now(timezone.utc).isoformat(),
    "status": "REVIEW REQUIRED", "current": current, "historical": historical,
    "currentCandidates": len(current), "historicalCandidates": len(historical),
    "historicalSourceBlobsScanned": scanned, "nonSourceObjectEntriesSkippedWithoutReading": skipped,
    "rawValuesSaved": False, "ephemeralHmacKeySaved": False,
    "productionAccess": False, "publishedTreeInspected": False,
    "limitations": "Source heuristic only; excluded runtime/private data and ignored evidence. No credential validity test, environment lookup, production access or Git rewrite. Fingerprints compare only within this run.",
}
(BASE / "exposure-results.json").write_text(json.dumps(result, indent=2))
print(json.dumps({k: result[k] for k in (
    "currentCandidates", "historicalCandidates", "historicalSourceBlobsScanned", "rawValuesSaved", "productionAccess"
)}))
