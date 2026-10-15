"""Independent inspection of synthetic accepted-provider renderer artifacts."""
import json
import pathlib
import re
import sys
import pymupdf

root = pathlib.Path(sys.argv[1])
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
assert manifest["synthetic"] is True and manifest["providerFixture"] is True
normalize = lambda value: re.sub(r"\s+", "", str(value)).lower()
results = []
for item in manifest["outputs"]:
    document = pymupdf.open(root / item["pdf"])
    assert len(document) == 1
    text = document[0].get_text()
    start = text.index("Professional Summary")
    end = text.index("Technical Skills", start)
    assert normalize(item["summary"]) in normalize(text[start:end]), "Summary missing from its section"
    assert all(normalize(bullet) in normalize(text) for bullet in item["bullets"])
    document[0].get_pixmap(matrix=pymupdf.Matrix(1.4, 1.4)).save(root / (item["key"] + ".png"))
    results.append({"key": item["key"], "pages": len(document), "summaryVisibleInSummarySection": True,
                    "selectedBulletsPresent": True, "fonts": sorted({font[3] for font in document[0].get_fonts()}),
                    "dimensionsPt": [document[0].rect.width, document[0].rect.height]})
(root / "pdf-inspection.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
print(json.dumps(results))
