"""Independent local PDF extraction/raster checks; requires PyMuPDF.
Usage: python tests/product/inspect-prd003-pdfs.py <artifact-directory>
Keeps extracted text, page PNGs and a JSON inspection report next to PDFs.
"""
import json
import pathlib
import sys
import pymupdf

root = pathlib.Path(sys.argv[1]).resolve()
report = {}
for filename in sorted(root.glob("*.pdf")):
    document = pymupdf.open(filename)
    text = "\n".join(page.get_text() for page in document)
    filename.with_suffix(".txt").write_text(text, encoding="utf-8")
    spans = []
    outside = []
    for index, page in enumerate(document):
        page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5)).save(root / f"{filename.stem}-{index + 1}.png")
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    if not span["text"].strip():
                        continue
                    spans.append(span["size"])
                    x0, y0, x1, y1 = span["bbox"]
                    if x0 < 0 or y0 < 0 or x1 > page.rect.width or y1 > page.rect.height:
                        outside.append({"page": index + 1, "text": span["text"], "bbox": span["bbox"]})
    expected = {
        "complete-resume": ["José 林", "Fixture University", "Second University", "3.9/4", "Faculty recognition", "Fixture License", "Fixture Board", "CRED-1", "Jun 2027", "Accessible Systems", "Fixture Journal", "Hindi", "Workshop Facilitator", "Student Representative", "Reviewed accessibility guidelines."],
        "edited-resume": ["Candidate corrected grade", "Fixture Board", "CRED-1", "Accessible Systems"],
        "uploaded-resume": ["Fixture University", "Sep 2023", "Present", "Fixture License", "CRED-UPLOAD", "Fixture Board", "Accessible Systems", "Hindi", "Reviewed accessibility guidelines."],
        "student": ["Fixture University", "CRED-1", "Accessible Systems", "Hindi"],
        "experienced-multipage": ["Fixture Employer 1", "Fixture Employer 20", "Fixture Board", "CRED-1"],
        "long-fields": ["José 林", "A&B", "50%", "C++", "CRED-1", "Accessible Systems"],
    }.get(filename.stem, [])
    missing = [value for value in expected if value not in " ".join(text.split())]
    if filename.stem == "long-fields":
        assert "{ }" in text and "\\" in text, "Literal braces/backslash lost during export"
    report[filename.name] = {"pages": len(document), "minimum_font_pt": min(spans) if spans else None, "missing_required_text": missing, "outside_page_spans": outside, "replacement_glyphs": "\ufffd" in text}
    assert not missing, (filename.name, missing)
    assert not outside, (filename.name, outside)
    assert "\ufffd" not in text, filename.name
    if filename.stem == "experienced-multipage":
        assert len(document) >= 2, "Multipage fixture did not exercise pagination"
        for index in range(1, 21):
            assert f"Fixture Employer {index}" in text
(root / "independent-pdf-inspection.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
