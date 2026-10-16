"""
Inspect and measure PDF geometry, margins, embedded fonts, and section bounding boxes
for comparative acceptance resumes (Software Engineer and Senior Backend Engineer).
Converts pages to PNG images for visual inspection deliverables.
"""
import json
import os
import pathlib
import sys
import pymupdf

PT_TO_MM = 25.4 / 72.0

def inspect_pdf(pdf_path):
    doc = pymupdf.open(pdf_path)
    page_count = len(doc)
    page = doc[0]
    rect = page.rect
    width_pt, height_pt = rect.width, rect.height
    width_mm = width_pt * PT_TO_MM
    height_mm = height_pt * PT_TO_MM

    # Extract text blocks and spans
    page_dict = page.get_text('dict')
    blocks = page_dict['blocks']
    spans = [
        s
        for b in blocks
        for line in b.get('lines', [])
        for s in line.get('spans', [])
        if s.get('text', '').strip()
    ]

    all_x0 = [s['bbox'][0] for s in spans]
    all_y0 = [s['bbox'][1] for s in spans]
    all_x1 = [s['bbox'][2] for s in spans]
    all_y1 = [s['bbox'][3] for s in spans]
    sizes = [s['size'] for s in spans]

    min_x0 = min(all_x0) if all_x0 else 0
    min_y0 = min(all_y0) if all_y0 else 0
    max_x1 = max(all_x1) if all_x1 else width_pt
    max_y1 = max(all_y1) if all_y1 else height_pt

    top_margin_mm = min_y0 * PT_TO_MM
    bottom_margin_mm = (height_pt - max_y1) * PT_TO_MM
    left_margin_mm = min_x0 * PT_TO_MM
    right_margin_mm = (width_pt - max_x1) * PT_TO_MM
    vertical_occupancy_ratio = (max_y1 - min_y0) / (height_pt - min_y0) if height_pt > min_y0 else 0

    # Fonts
    raw_fonts = page.get_fonts()
    font_details = []
    for f in raw_fonts:
        xref = f[0]
        font_name = f[3]
        font_ext = f[8] if len(f) > 8 else ''
        is_embedded = bool(doc.extract_font(xref)[3])
        has_tounicode = '/ToUnicode' in doc.xref_object(xref)
        font_details.append({
            'xref': xref,
            'name': font_name,
            'extension': font_ext,
            'embedded': is_embedded,
            'toUnicode': has_tounicode,
        })

    # Render PNG image for deliverable
    pix = page.get_pixmap(dpi=150)
    png_path = pdf_path.with_suffix('.png')
    pix.save(str(png_path))

    return {
        'pdfFile': str(pdf_path.name),
        'pngFile': str(png_path.name),
        'pageCount': page_count,
        'isExactlyOnePage': page_count == 1,
        'dimensions': {
            'widthPt': round(width_pt, 2),
            'heightPt': round(height_pt, 2),
            'widthMm': round(width_mm, 2),
            'heightMm': round(height_mm, 2),
            'isA4': abs(width_pt - 595.28) < 1.0 and abs(height_pt - 841.89) < 1.0,
        },
        'typography': {
            'minimumFontPt': round(min(sizes), 2) if sizes else 0,
            'maximumFontPt': round(max(sizes), 2) if sizes else 0,
            'fontFloorPass': (min(sizes) if sizes else 0) >= 9.95,
            'embeddedFontsCount': len(font_details),
            'allFontsEmbedded': all(f['embedded'] for f in font_details) if font_details else False,
            'fonts': font_details,
        },
        'margins': {
            'topMarginMm': round(top_margin_mm, 2),
            'bottomMarginMm': round(bottom_margin_mm, 2),
            'leftMarginMm': round(left_margin_mm, 2),
            'rightMarginMm': round(right_margin_mm, 2),
            'topMarginStatus': 'PASS' if 11.5 <= top_margin_mm <= 16.5 else 'WARN',
            'bottomMarginStatus': 'PASS' if 11.5 <= bottom_margin_mm <= 22.0 else 'WARN',
            'verticalOccupancyRatio': round(vertical_occupancy_ratio, 3),
        },
        'textSummary': {
            'totalSpans': len(spans),
            'contentBoundingBox': {
                'x0_pt': round(min_x0, 2),
                'y0_pt': round(min_y0, 2),
                'x1_pt': round(max_x1, 2),
                'y1_pt': round(max_y1, 2),
            },
        },
    }

def main():
    base_dir = pathlib.Path('output/unified-resume/comparative-acceptance')
    report = {}
    for role in ['software-engineer', 'senior-backend-engineer']:
        pdf_file = base_dir / f'{role}.pdf'
        if pdf_file.exists():
            print(f'Inspecting {pdf_file}...')
            report[role] = inspect_pdf(pdf_file)
        else:
            print(f'Warning: {pdf_file} not found')

    report_file = base_dir / 'geometry-measurement-report.json'
    report_file.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'Report written to {report_file}')
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    main()
