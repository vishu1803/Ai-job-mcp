"""Independent measured PDF/OpenXML inspection. No candidate text in stdout errors."""
import base64, json, pathlib, re, sys, zipfile, xml.etree.ElementTree as ET
from urllib.parse import urlsplit,urlunsplit
import pymupdf

root=pathlib.Path(sys.argv[1])
request=json.loads(root.joinpath('input.json').read_text(encoding='utf-8'))
doc=pymupdf.open(root/'resume.pdf')
if len(doc)>10: sys.exit(42)
normalize=lambda text: re.sub(r'\s+', '', re.sub(r'[-–—]+','-',str(text).replace('“','"').replace('”','"').replace('’',"'"))).lower()
text='\n'.join(page.get_text(sort=False) for page in doc)
normalized=normalize(text)
missing=[i for i,value in enumerate(request['expected']) if normalize(value) not in normalized]
if missing:
    print(f"MISSING: {[request['expected'][i] for i in missing]}", file=sys.stderr)
word_spacing=all(re.search(re.escape(left)+r'\s+'+re.escape(right),text,re.IGNORECASE)
    for value in request['expected'] for left,right in re.findall(r'([^\W_]+)\s+([^\W_]+)',str(value)))
cursor=0
reading_order=True
for value in request['expected']:
    found=normalized.find(normalize(value),cursor)
    if found<0: reading_order=False; break
    cursor=found+len(normalize(value))
page0 = doc[0] if len(doc) > 0 else None
first_heading_y0 = None
if page0 is not None:
    for b in request.get('blocks', []):
        if b.get('style') == 'Heading1':
            matches = page0.search_for(b['text'])
            if matches:
                first_heading_y0 = min(m.y0 for m in matches)
                break
    if first_heading_y0 is None:
        for b in page0.get_text('dict')['blocks']:
            for l in b.get('lines', []):
                for s in l.get('spans', []):
                    if s.get('size', 0) >= 10.4 and s.get('bbox', [0, 0, 0, 0])[1] > 85:
                        first_heading_y0 = s['bbox'][1]
                        break
                if first_heading_y0 is not None: break
            if first_heading_y0 is not None: break
    if first_heading_y0 is None:
        first_heading_y0 = 120.0

header_web_links = [pymupdf.Rect(l['from']) for l in page0.get_links() if l.get('uri', '').startswith('http') and l['from'].y1 <= (first_heading_y0 or 120.0) + 1.0] if page0 else []
link_band_y0 = (min((r.y0 for r in header_web_links), default=0.0) - 2.0) if header_web_links else 0.0
link_band_y1 = (max((r.y1 for r in header_web_links), default=0.0) + 2.0) if header_web_links else 0.0

sizes=[]; outside=[]; overlaps=[]; links=[]; a4=True;fonts_embedded=True;unicode_maps=True
body_sizes=[]; header_sizes=[]; link_sizes=[]
for page_idx, page in enumerate(doc):
    a4=a4 and abs(page.rect.width-595.276)<1 and abs(page.rect.height-841.89)<1
    spans=[s for b in page.get_text('dict')['blocks'] for line in b.get('lines',[]) for s in line.get('spans',[]) if s['text'].strip()]
    fonts=page.get_fonts()
    fonts_embedded=fonts_embedded and bool(fonts) and all(bool(doc.extract_font(font[0])[3]) for font in fonts)
    unicode_maps=unicode_maps and bool(fonts) and all('/ToUnicode' in doc.xref_object(font[0]) for font in fonts)
    links.extend(link.get('uri','') for link in page.get_links())
    for i,span in enumerate(spans):
        size = span['size']
        center_y = (span['bbox'][1] + span['bbox'][3]) / 2.0
        is_header = (page_idx == 0 and span['bbox'][3] <= (first_heading_y0 or 85.0))
        is_header_link = (page_idx == 0 and bool(header_web_links) and link_band_y0 <= center_y <= link_band_y1 and span['bbox'][3] <= (first_heading_y0 or 120.0) + 1.0)
        if is_header:
            header_sizes.append(size)
            if is_header_link or size < 9.0:
                link_sizes.append(size)
        else:
            body_sizes.append(size)
        sizes.append(size)
        rect=pymupdf.Rect(span['bbox'])
        # Half-inch margin (36pt), allowing 2pt font bounding-box ascender/descender tolerance.
        if rect.x0<34 or rect.y0<34 or rect.x1>page.rect.width-34 or rect.y1>page.rect.height-34:
            outside.append(i)
        for other in spans[i+1:]:
            intersection=rect & pymupdf.Rect(other['bbox'])
            if intersection.width>2 and intersection.height>3.2:
                overlaps.append(i)
                print(f"OVERLAP: '{span['text']}' bbox={rect} with '{other['text']}' bbox={other['bbox']} inter={intersection}", file=sys.stderr)
def normalized_link(value):
    parts=urlsplit(value)
    return urlunsplit((parts.scheme,parts.netloc,parts.path or '/',parts.query,parts.fragment))
missing_links=[i for i,value in enumerate(request['links']) if normalized_link(value) not in [normalized_link(link) for link in links]]
page_map=[]
for node in request['mapNodes']:
    # Ambiguous repeated source text never produces a purported exact mapping.
    if sum(normalize(page.get_text()).count(normalize(node['text'])) for page in doc)!=1: continue
    for index,page in enumerate(doc):
        for rect in page.search_for(node['text']):
            page_map.append({'nodeId':node['nodeId'],'pageIndex':index,'bounds':{'top':rect.y0,'left':rect.x0,'width':rect.width,'height':rect.height}})
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
with zipfile.ZipFile(root/'resume.docx') as archive:
    if archive.testzip() is not None: raise ValueError('Invalid ZIP CRC')
    for name in archive.namelist():
        if name.endswith('.xml') or name.endswith('.rels'): ET.fromstring(archive.read(name))
    document=ET.fromstring(archive.read('word/document.xml'))
    paragraphs=[''.join(t.text or '' for t in p.findall('.//w:t',ns)) for p in document.findall('.//w:body/w:p',ns)]
    docx_preserved=paragraphs==[b['text'] for b in request['blocks']]
    page_size=document.find('.//w:pgSz',ns).attrib
    if page_size.get('{'+ns['w']+'}w')!='11906' or page_size.get('{'+ns['w']+'}h')!='16838': raise ValueError('DOCX is not A4')
    margins=document.find('.//w:pgMar',ns).attrib
    if any(not 720<=int(margins.get('{'+ns['w']+'}'+side,'0'))<=864 for side in ['top','right','bottom','left']): raise ValueError('DOCX margin outside protected bounds')
    styles=ET.fromstring(archive.read('word/styles.xml'))
    if any(int(size.attrib['{'+ns['w']+'}val'])<20 for size in styles.findall('.//w:sz',ns)): raise ValueError('DOCX configured font below floor')
glyphs_safe=not re.search(r'[\uFFFD\x00]|\\(?:textbf|vspace|item|begin)\b',text)
body_minimum=min(body_sizes) if body_sizes else (min(sizes) if sizes else 0)
header_minimum=min(header_sizes) if header_sizes else body_minimum
font_floor_passed=(body_minimum>=9.95) and (header_minimum>=8.15 if header_sizes else True)
minimum=body_minimum
checks={'ONE_PAGE':len(doc)==1,'A4':a4,'FONT_FLOOR':font_floor_passed,'EMBEDDED_FONTS':fonts_embedded,'UNICODE_MAPS':unicode_maps,'SELECTED_TEXT':not missing,'WORD_SPACING':word_spacing,'SOURCE_LINKS':not missing_links,'READING_ORDER':reading_order,'MARGINS':not outside,'OVERLAPS':not overlaps,'GLYPHS':glyphs_safe,'DOCX_TEXT':docx_preserved}
png=doc[0].get_pixmap(dpi=120).tobytes('png')
result={'pageCount':len(doc),'a4':a4,'minimumFontPt':minimum,'fontsEmbedded':fonts_embedded,'unicodeMaps':unicode_maps,'wordSpacing':word_spacing,'textPreserved':not missing and not missing_links,'readingOrder':reading_order,'noClipping':not outside,'noOverlaps':not overlaps,'glyphsSafe':glyphs_safe,'docxTextPreserved':docx_preserved,'failedChecks':[key for key,passed in checks.items() if not passed]}
root.joinpath('result.json').write_text(json.dumps({'verification':result,'pageMap':page_map,'png':base64.b64encode(png).decode(),'text':text},ensure_ascii=False),encoding='utf-8')
