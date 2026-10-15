"""Inspect actual browser print PDFs; no dependency installation or production I/O."""
import hashlib
import json
import pathlib
import re
import subprocess

root = pathlib.Path("generated-artifacts/final-operational-gate/owner-readiness/transfer-document-evidence")
documents = []
for pdf in sorted(root.glob("*.pdf")):
    info = subprocess.check_output(["pdfinfo", str(pdf)], text=True)
    text = subprocess.check_output(["pdftotext", "-layout", str(pdf), "-"], text=True)
    pages = int(re.search(r"Pages:\s+(\d+)", info).group(1))
    page_texts = text.split("\f")
    last = page_texts[pages - 1].strip()
    # Default reading order separates table cells. Poppler de-hyphenates their
    # wrapped trailing hyphen; ignore only whitespace/hyphens for this ID check.
    plain = subprocess.check_output(["pdftotext", str(pdf), "-"], text=True)
    compact = re.sub(r"[\s-]+", "", plain)
    assert "QATRANSFERITEM" in compact and "QATRANSFERLOT" in compact
    assert "TOTALS" in text
    assert not re.search(r"\bTownshop\b", text)
    documents.append({
        "file": str(pdf), "bytes": pdf.stat().st_size,
        "sha256": hashlib.sha256(pdf.read_bytes()).hexdigest(),
        "pages": pages, "text": text, "lastPageText": last,
        "footerOnlyLastPage": len(last.splitlines()) <= 2,
        "canonicalBranchDisplay": "Windhoek CBD" in text,
        "perLinePresentation": "Explicit partial approval10 prints10; full approval without stored line quantity prints dash, while total falls back to prepared quantity. Dash is not missing goods or proof of a separate approval.",
    })
assert len(documents) == 4
result = {
    "status": "PASS CONTENT / PAGINATION LIMITATION RETAINED",
    "documents": documents,
    "limitations": [
        "A received warehouse note retains a footer-only second page; branch notes may split audit/footer content.",
        "No separate receiving-document button was found in Stock transfer controls; the same note includes Received/Delivered section.",
        "Actual application print HTML captured through Chromium PDF, not an HTTP PDF download or native OS print-dialog test.",
    ],
}
pathlib.Path("generated-artifacts/owner-approval-package/document-review.json").write_text(json.dumps(result, indent=2))
print(json.dumps({"status": result["status"], "documents": len(documents), "pages": sum(d["pages"] for d in documents)}))
