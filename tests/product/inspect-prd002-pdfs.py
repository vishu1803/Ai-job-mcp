"""Independent physical-page, text, link, font and raster proof for synthetic PDFs."""
import json
import pathlib
import sys
import pymupdf

root = pathlib.Path(sys.argv[1]).resolve()
results = []
normalize = lambda value: ''.join(str(value).split())
for filename in sorted(root.glob('*.pdf')):
    document = pymupdf.open(filename)
    view = json.loads(filename.with_suffix('.view.json').read_text(encoding='utf-8'))
    text = '\n'.join(page.get_text(sort=False) for page in document)
    filename.with_suffix('.txt').write_text(text, encoding='utf-8')
    wanted = [view['candidateIdentity']['displayName'], view['candidateIdentity']['email'], view['candidateIdentity']['headline'], view['summary']['text']]
    links = []
    for category in view.get('skills', {}).get('categories', []):
        wanted.extend(skill['name'] for skill in category.get('skills', []))
    for entry in view['candidateIdentity'].get('links', []):
        links.append(entry['url'])
    for key in ['experience', 'projects', 'education', 'certifications']:
        for entry in view.get(key, []):
            for field in ['title', 'company', 'displayName', 'description', 'summary', 'institution', 'degree', 'fieldOfStudy', 'grade', 'issuingOrganization', 'credentialId', 'notes']:
                if entry.get(field): wanted.append(entry[field])
            if key == 'certifications': wanted.append(entry['name'])
            wanted.extend(entry.get('technologies', []))
            wanted.extend(entry.get('honors', []))
            wanted.extend(entry.get('coursework', []))
            wanted.extend(b if isinstance(b, str) else b['text'] for b in entry.get('bullets', []))
            links.extend(entry.get(field) for field in ['repositoryUrl', 'liveUrl', 'credentialUrl'] if entry.get(field))
    for entries in view.get('optionalSections', {}).values():
        for entry in entries:
            wanted.extend(entry.get(field) for field in ['title', 'name', 'description', 'summary', 'organization', 'publisher', 'language', 'proficiency'] if entry.get(field))
            wanted.extend(entry.get('items', []))
            wanted.extend(b if isinstance(b, str) else b['text'] for b in entry.get('bullets', []))
    missing = [value for value in wanted if normalize(value) not in normalize(text)]
    fonts, outside, overlapping, rendered_links = [], [], [], []
    for index, page in enumerate(document):
        assert abs(page.rect.width - 595.276) < 1 and abs(page.rect.height - 841.89) < 1
        page.get_pixmap(matrix=pymupdf.Matrix(1.5,1.5)).save(root / f'{filename.stem}-{index+1}.png')
        spans = [span for block in page.get_text('dict')['blocks'] for line in block.get('lines', []) for span in line.get('spans', []) if span['text'].strip()]
        for span in spans:
            fonts.append(span['size'])
            rect = pymupdf.Rect(span['bbox'])
            if not page.rect.contains(rect): outside.append(span['text'])
        for a, first in enumerate(spans):
            for second in spans[a+1:]:
                intersection = pymupdf.Rect(first['bbox']) & pymupdf.Rect(second['bbox'])
                if intersection.width > 2 and intersection.height > 2:
                    overlapping.append([first['text'],second['text']])
        rendered_links.extend(link.get('uri','') for link in page.get_links())
    broken = [link for link in links if link not in rendered_links]
    result = {'fixture':filename.stem, 'pages':len(document), 'minFontPt':min(fonts), 'missingText':missing, 'outsideSpans':outside, 'overlappingSpans':overlapping, 'brokenLinks':broken, 'replacementGlyphs':'\ufffd' in text}
    results.append(result)
    assert len(document) == 1 and min(fonts) >= 9.95 and not missing and not outside and not overlapping and not broken and '\ufffd' not in text, result
    assert not any(word in text for word in ['production-ready', 'Experienced in developing maintainable', 'Candidate-provided claims (not independently verified)'])
root.joinpath('independent-inspection.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False,indent=2))
