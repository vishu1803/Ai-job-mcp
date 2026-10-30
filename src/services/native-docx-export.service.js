import { createZipArchive } from '../utils/zip-packager.js';
const xml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
/** Native WordprocessingML using the established ZIP packager with hyperlink relationships. */
export function buildStudioDocx(blocks, { marginIn = 0.5, lineHeight = 1.1 } = {}) {
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const relsNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const hyperlinkRels = [];
  let nextRelId = 3;

  const paragraphs = blocks
    .map((block) => {
      const { text, style, hyperlinks } = block;
      const isBullet = style === 'Bullet';
      const pPr = `<w:pPr><w:pStyle w:val="${style}"/>${isBullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ''}</w:pPr>`;
      if (Array.isArray(hyperlinks) && hyperlinks.length > 0) {
        if (
          hyperlinks.length === 1 &&
          text &&
          text.includes(hyperlinks[0].text) &&
          text !== hyperlinks[0].text
        ) {
          const item = hyperlinks[0];
          const relId = `rId${nextRelId++}`;
          hyperlinkRels.push({ id: relId, target: item.url });
          const idx = text.indexOf(item.text);
          const before = text.slice(0, idx);
          const after = text.slice(idx + item.text.length);
          const runElements = [];
          if (before) runElements.push(`<w:r><w:t xml:space="preserve">${xml(before)}</w:t></w:r>`);
          runElements.push(
            `<w:hyperlink r:id="${relId}" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/><w:color w:val="000000"/><w:u w:val="none"/></w:rPr><w:t xml:space="preserve">${xml(item.text)}</w:t></w:r></w:hyperlink>`
          );
          if (after) runElements.push(`<w:r><w:t xml:space="preserve">${xml(after)}</w:t></w:r>`);
          return `<w:p>${pPr}${runElements.join('')}</w:p>`;
        }
        const runElements = [];
        for (let i = 0; i < hyperlinks.length; i++) {
          const item = hyperlinks[i];
          const relId = `rId${nextRelId++}`;
          hyperlinkRels.push({ id: relId, target: item.url });
          runElements.push(
            `<w:hyperlink r:id="${relId}" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/><w:color w:val="000000"/><w:u w:val="none"/></w:rPr><w:t xml:space="preserve">${xml(item.text)}</w:t></w:r></w:hyperlink>`
          );
          if (i < hyperlinks.length - 1) {
            runElements.push(`<w:r><w:t xml:space="preserve"> | </w:t></w:r>`);
          }
        }
        return `<w:p>${pPr}${runElements.join('')}</w:p>`;
      }
      return `<w:p>${pPr}<w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
    })
    .join('');
  const margin = Math.round(marginIn * 1440),
    line = Math.round(lineHeight * 240);
  const document = `${declaration}<w:document xmlns:w="${ns}" xmlns:r="${relsNs}"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const style = (id, size, bold = false) =>
    `<w:style w:type="paragraph" w:styleId="${id}"${id === 'Normal' ? ' w:default="1"' : ''}><w:name w:val="${id}"/>${id !== 'Normal' ? '<w:basedOn w:val="Normal"/>' : ''}<w:pPr><w:spacing w:after="${id === 'Heading1' ? 60 : 20}" w:line="${line}" w:lineRule="auto"/>${/^Heading/.test(id) ? '<w:keepNext/>' : ''}</w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${bold ? '<w:b/>' : ''}</w:rPr></w:style>`;
  const hyperlinkStyle = `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:color w:val="000000"/><w:u w:val="none"/></w:rPr></w:style>`;
  const entries = {
    '[Content_Types].xml': `${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`,
    '_rels/.rels': `${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': document,
    'word/styles.xml': `${declaration}<w:styles xmlns:w="${ns}">${style('Normal', 20)}${style('Title', 36, true)}${style('Heading1', 21, true)}${style('Heading2', 20, true)}${style('Bullet', 20)}${hyperlinkStyle}</w:styles>`,
    'word/numbering.xml': `${declaration}<w:numbering xmlns:w="${ns}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="240"/></w:tabs><w:ind w:left="240" w:hanging="180"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
    'word/_rels/document.xml.rels': `${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${hyperlinkRels.map((r) => `<Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(r.target)}" TargetMode="External"/>`).join('')}</Relationships>`,
  };
  return createZipArchive(
    Object.entries(entries).map(([name, data]) => ({
      name,
      data,
      date: new Date('2000-01-01T00:00:00Z'),
    }))
  );
}
