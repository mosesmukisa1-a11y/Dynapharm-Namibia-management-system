"""Render only newly generated, synthetic release-audit PDFs."""
from pathlib import Path
import json
import sys
import fitz

root = Path(sys.argv[1] if len(sys.argv) > 1 else "generated-artifacts/final-release-gate/documents")
if not root.resolve().is_relative_to(Path("generated-artifacts").resolve()):
    raise ValueError("PDF audit output must remain in generated-artifacts")
root.mkdir(parents=True, exist_ok=True)
results = []
for source in sorted(root.glob("*.pdf")):
    document = fitz.open(source)
    pages = []
    for number, page in enumerate(document):
        text = page.get_text()
        clipped = [list(word[:4]) for word in page.get_text("words")
                   if word[0] < -1 or word[1] < -1
                   or word[2] > page.rect.width + 1 or word[3] > page.rect.height + 1]
        image = root / f"{source.stem}-page-{number + 1}.png"
        page.get_pixmap(matrix=fitz.Matrix(1.2, 1.2), alpha=False).save(image)
        pages.append({"page": number + 1, "width": page.rect.width,
                      "height": page.rect.height, "characters": len(text),
                      "blank": not text.strip(), "outOfBoundsWords": clipped,
                      "image": str(image), "text": text})
    results.append({"file": str(source), "pages": pages})
(root / "pdf-review.json").write_text(json.dumps(results, indent=2))
print(json.dumps({"pdfs": len(results), "pages": sum(len(r["pages"]) for r in results)}))
