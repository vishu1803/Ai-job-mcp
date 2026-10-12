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
        "multiple-degrees-credentials": ["Second University", "BSc", "Second Credential", "Second Board"],
        "incomplete-profile": ["Incomplete Fixture", "Named University", "Candidate-provided documentation work."],
        "many-projects": ["Accessible Interface", "Candidate-described navigation prototype", "JavaScript"],
    }.get(filename.stem, [])
    missing = [value for value in expected if value not in " ".join(text.split())]
    source_path = filename.with_suffix(".json")
    if source_path.exists():
        source = json.loads(source_path.read_text(encoding="utf-8"))
        normalized_text = " ".join(text.split())
        required = []
        for entry in source.get("experience", []):
            required.extend(entry.get(key) for key in ["title", "company", "summary", "description", "employmentType"])
            required.extend(entry.get("technologies", []))
            required.extend(bullet if isinstance(bullet, str) else bullet.get("text") for bullet in entry.get("bullets", []))
        for entry in source.get("projects", []):
            required.extend([entry.get("displayName"), entry.get("description")])
            required.extend(bullet if isinstance(bullet, str) else bullet.get("text") for bullet in entry.get("bullets", []))
        for entry in source.get("education", []):
            required.extend(entry.get(key) for key in ["institution", "degree", "grade", "location"])
            required.extend(entry.get("honors", []))
        for entry in source.get("certifications", []):
            required.extend(entry.get(key) for key in ["name", "issuingOrganization", "credentialId", "notes"])
        for entries in source.get("optionalSections", {}).values():
            for entry in entries:
                required.extend(entry.get(key) for key in ["title", "name", "organization", "publisher", "language", "proficiency", "description", "summary"])
                required.extend(entry.get("items", []))
                required.extend(entry.get("bullets", []))
        missing.extend(value for value in required if value and " ".join(value.split()) not in normalized_text)
        links = [link.get("uri", "") for page in document for link in page.get_links()]
        for link in source.get("candidateIdentity", {}).get("links", []):
            # The existing Chrome header intentionally prints selectable URL text
            # without protocol instead of link annotations. Compare that exact
            # presentation contract; do not claim it is a clickable hyperlink.
            visible = link["url"].removeprefix("https://").removeprefix("http://").removeprefix("www.").rstrip("/")
            assert link["url"] in links or visible in normalized_text, (filename.name, "Lost contact URL", link["url"])
        for entry in source.get("projects", []):
            for key in ["repositoryUrl", "liveUrl"]:
                url = entry.get(key)
                if url:
                    assert url in links or url in normalized_text, (filename.name, "Lost project URL", url)
        if filename.stem == "incomplete-profile":
            assert not source.get("summary", {}).get("text"), "Empty summary was fabricated"
            assert "Software Engineer" not in text and "2020" not in text and "Present" not in text
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
