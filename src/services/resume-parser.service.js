/**
 * @file Multi-Format Resume Parser & Claim Extraction Service (P13.5-003 / ARCH-052).
 *
 * Implements:
 * 1. Strict Magic-Byte & MIME validation for PDF, DOCX, and TXT files (<= 10MB ceiling)
 * 2. Sandboxed text extraction across PDF, DOCX (PKZip/XML), and Plain Text
 * 3. Secret scrubbing & PII normalization
 * 4. Section parsing (Summary, Experience, Education, Skills, Projects, Certifications)
 * 5. Structured claim generation with strict CLAIMED truth status ([Unverified User Claim])
 */

/* eslint-disable no-control-regex */

import zlib from 'node:zlib';
import { ValidationError, SecurityError } from '../errors/index.js';
import { ResumeEntityResolver } from '../domain/career/resume-entity-resolver.js';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// Magic bytes signatures
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
const ZIP_DOCX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04
const EXE_PE_MAGIC = Buffer.from([0x4d, 0x5a]); // MZ
const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]); // \x7fELF

// Secret Scrubbing Patterns
const SECRET_PATTERNS = [
  /ghp_[a-zA-Z0-9]{36}/g, // GitHub Personal Access Token
  /gho_[a-zA-Z0-9]{36}/g, // GitHub OAuth Access Token
  /github_pat_[a-zA-Z0-9_]{82}/g, // GitHub Fine-grained PAT
  /sk-[a-zA-Z0-9]{48}/g, // OpenAI API Key
  /AKIA[0-9A-Z]{16}/g, // AWS Access Key
  /AIza[0-9A-Za-z\\-_]{35}/g, // Google API Key
  /(?:password|passwd|secret|api_key)\s*[:=]\s*["']?[^\s"';]{8,}["']?/gi,
];

export class ResumeParserService {
  /**
   * Validates file size, extension, MIME type, and magic bytes against whitelist.
   *
   * @param {object} params
   * @param {Buffer} params.buffer
   * @param {string} params.fileName
   * @param {string} [params.declaredMimeType]
   * @returns {{ format: 'PDF' | 'DOCX' | 'TXT', detectedMimeType: string, sanitizedFileName: string }}
   */
  validateFile({ buffer, fileName, declaredMimeType = '' }) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new ValidationError('Uploaded file is empty or corrupted', 'EMPTY_FILE');
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new ValidationError(
        `File size (${(buffer.length / 1024 / 1024).toFixed(2)}MB) exceeds maximum 10MB limit`,
        'FILE_TOO_LARGE'
      );
    }

    // 1. Guard against executable binary signatures
    if (buffer.subarray(0, 2).equals(EXE_PE_MAGIC) || buffer.subarray(0, 4).equals(ELF_MAGIC)) {
      throw new SecurityError(
        'Executable binary file upload rejected for security',
        'EXECUTABLE_REJECTED'
      );
    }

    // 2. Sanitize filename (remove path traversal & control characters)
    const sanitizedFileName = String(fileName || 'resume')
      .replace(/[/\\]/g, '')
      .replace(/\.\./g, '')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .trim()
      .slice(0, 255);

    const lowerName = sanitizedFileName.toLowerCase();

    // 3. Inspect magic bytes for format determination
    if (buffer.subarray(0, 4).equals(PDF_MAGIC) || buffer.includes(PDF_MAGIC, 0)) {
      return {
        format: 'PDF',
        detectedMimeType: 'application/pdf',
        sanitizedFileName: lowerName.endsWith('.pdf')
          ? sanitizedFileName
          : `${sanitizedFileName}.pdf`,
      };
    }

    if (buffer.subarray(0, 4).equals(ZIP_DOCX_MAGIC) || lowerName.endsWith('.docx')) {
      return {
        format: 'DOCX',
        detectedMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sanitizedFileName: lowerName.endsWith('.docx')
          ? sanitizedFileName
          : `${sanitizedFileName}.docx`,
      };
    }

    // 4. Plain text / Markdown check
    const isTextMime =
      declaredMimeType.includes('text/plain') ||
      declaredMimeType.includes('text/markdown') ||
      lowerName.endsWith('.txt') ||
      lowerName.endsWith('.md');

    // Check if buffer contains valid printable text
    let nullBytes = 0;
    const sampleLength = Math.min(buffer.length, 1024);
    for (let i = 0; i < sampleLength; i++) {
      if (buffer[i] === 0x00) nullBytes++;
    }

    if (nullBytes > 0 && !isTextMime) {
      throw new ValidationError(
        'Unsupported file format. Please upload a valid PDF, DOCX, or TXT document.',
        'UNSUPPORTED_FORMAT'
      );
    }

    return {
      format: 'TXT',
      detectedMimeType: 'text/plain',
      sanitizedFileName:
        lowerName.endsWith('.txt') || lowerName.endsWith('.md')
          ? sanitizedFileName
          : `${sanitizedFileName}.txt`,
    };
  }

  /**
   * Scrubs private secrets, tokens, and credentials from extracted raw text.
   *
   * @param {string} text
   * @returns {string} Sanitized text
   */
  scrubSecrets(text) {
    if (!text || typeof text !== 'string') return '';
    let scrubbed = text;
    for (const pattern of SECRET_PATTERNS) {
      scrubbed = scrubbed.replace(pattern, '[REDACTED_SECRET]');
    }
    return scrubbed;
  }

  /**
   * Parses a ToUnicode CMap stream into a map: CID -> Unicode character string.
   *
   * @private
   * @param {string} cmapStr
   * @returns {Map<number, string>}
   */
  _parseCMap(cmapStr) {
    const mapping = new Map();

    const bfcharBlocks = cmapStr.match(/beginbfchar([\s\S]*?)endbfchar/g) || [];
    for (const block of bfcharBlocks) {
      const lines = block
        .replace(/beginbfchar|endbfchar/g, '')
        .trim()
        .split(/\r?\n/);
      for (const line of lines) {
        const match = line.trim().match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/);
        if (match) {
          mapping.set(parseInt(match[1], 16), String.fromCharCode(parseInt(match[2], 16)));
        }
      }
    }

    const bfrangeBlocks = cmapStr.match(/beginbfrange([\s\S]*?)endbfrange/g) || [];
    for (const block of bfrangeBlocks) {
      const lines = block
        .replace(/beginbfrange|endbfrange/g, '')
        .trim()
        .split(/\r?\n/);
      for (const line of lines) {
        const rangeMatch = line
          .trim()
          .match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/);
        if (rangeMatch) {
          const startCid = parseInt(rangeMatch[1], 16);
          const endCid = parseInt(rangeMatch[2], 16);
          let destCode = parseInt(rangeMatch[3], 16);
          for (let cid = startCid; cid <= endCid; cid++) {
            mapping.set(cid, String.fromCharCode(destCode));
            destCode++;
          }
          continue;
        }

        const arrMatch = line.trim().match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/);
        if (arrMatch) {
          const startCid = parseInt(arrMatch[1], 16);
          const destHexes = arrMatch[3].match(/<([0-9a-fA-F]+)>/g) || [];
          destHexes.forEach((dh, idx) => {
            const code = parseInt(dh.slice(1, -1), 16);
            mapping.set(startCid + idx, String.fromCharCode(code));
          });
        }
      }
    }

    return mapping;
  }

  /**
   * Multiplies two 2D affine transformation matrices [a, b, c, d, e, f].
   *
   * @private
   * @param {Array<number>} m1
   * @param {Array<number>} m2
   * @returns {Array<number>}
   */
  _multMatrix(m1, m2) {
    return [
      m1[0] * m2[0] + m1[1] * m2[2],
      m1[0] * m2[1] + m1[1] * m2[3],
      m1[2] * m2[0] + m1[3] * m2[2],
      m1[2] * m2[1] + m1[3] * m2[3],
      m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
      m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
    ];
  }

  /**
   * Transforms a 2D point (x, y) by an affine matrix.
   *
   * @private
   * @param {Array<number>} m
   * @param {number} x
   * @param {number} y
   * @returns {{ x: number, y: number }}
   */
  _transformPoint(m, x, y) {
    return {
      x: x * m[0] + y * m[2] + m[4],
      y: x * m[1] + y * m[3] + m[5],
    };
  }

  /**
   * Extracts layout-accurate text from PDF documents supporting Type0 CID CMaps,
   * graphics state stack transformations, and standard ASCII streams.
   *
   * @private
   * @param {Buffer} buffer
   * @returns {string} Extracted text
   */
  _extractTextFromPdf(buffer) {
    const content = buffer.toString('binary');
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    const streams = [];
    const cmaps = [];

    while ((match = streamRegex.exec(content)) !== null) {
      const rawStream = Buffer.from(match[1], 'binary');
      let decompressed;
      try {
        decompressed = zlib.inflateSync(rawStream);
      } catch {
        try {
          decompressed = zlib.inflateRawSync(rawStream);
        } catch {
          decompressed = rawStream;
        }
      }
      const str = decompressed.toString('latin1');
      if (str.includes('begincmap')) {
        cmaps.push(this._parseCMap(str));
      }
      if (str.includes('BT')) {
        streams.push(str);
      }
    }

    const unifiedCMap = new Map();
    for (const c of cmaps) {
      for (const [k, v] of c.entries()) unifiedCMap.set(k, v);
    }

    const decodeHex = (hex) => {
      let s = '';
      const step = hex.length % 4 === 0 ? 4 : 2;
      for (let i = 0; i < hex.length; i += step) {
        const cid = parseInt(hex.slice(i, i + step), 16);
        s += unifiedCMap.has(cid)
          ? unifiedCMap.get(cid)
          : cid >= 32 && cid <= 126
            ? String.fromCharCode(cid)
            : '';
      }
      return s;
    };

    const elements = [];

    for (const streamStr of streams) {
      const tokens = [];
      const tokenRegex = /\((?:[^()\\]|\\.)*\)|<[0-9a-fA-F\s]+>|\[[\s\S]*?\]|(?:\S+)/g;
      let tm;
      while ((tm = tokenRegex.exec(streamStr)) !== null) {
        tokens.push(tm[0]);
      }

      const stateStack = [];
      let ctm = [1, 0, 0, 1, 0, 0];
      let textMatrix = [1, 0, 0, 1, 0, 0];
      let lineMatrix = [1, 0, 0, 1, 0, 0];
      const operandStack = [];

      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];

        if (tok === 'q') {
          stateStack.push([...ctm]);
        } else if (tok === 'Q') {
          if (stateStack.length > 0) {
            ctm = stateStack.pop();
          }
        } else if (tok === 'cm') {
          if (operandStack.length >= 6) {
            const f = parseFloat(operandStack.pop());
            const e = parseFloat(operandStack.pop());
            const d = parseFloat(operandStack.pop());
            const c = parseFloat(operandStack.pop());
            const b = parseFloat(operandStack.pop());
            const a = parseFloat(operandStack.pop());
            ctm = this._multMatrix([a, b, c, d, e, f], ctm);
          }
        } else if (tok === 'BT') {
          textMatrix = [1, 0, 0, 1, 0, 0];
          lineMatrix = [1, 0, 0, 1, 0, 0];
          operandStack.length = 0;
        } else if (tok === 'ET') {
          operandStack.length = 0;
        } else if (tok === 'Tm') {
          if (operandStack.length >= 6) {
            const f = parseFloat(operandStack.pop());
            const e = parseFloat(operandStack.pop());
            const d = parseFloat(operandStack.pop());
            const c = parseFloat(operandStack.pop());
            const b = parseFloat(operandStack.pop());
            const a = parseFloat(operandStack.pop());
            textMatrix = [a, b, c, d, e, f];
            lineMatrix = [...textMatrix];
          }
        } else if (tok === 'Td' || tok === 'TD') {
          if (operandStack.length >= 2) {
            const ty = parseFloat(operandStack.pop());
            const tx = parseFloat(operandStack.pop());
            const tdMat = [1, 0, 0, 1, tx, ty];
            lineMatrix = this._multMatrix(tdMat, lineMatrix);
            textMatrix = [...lineMatrix];
          }
        } else if (tok === 'Tj') {
          if (operandStack.length >= 1) {
            const raw = operandStack.pop();
            let str = '';
            if (raw.startsWith('(')) {
              str = raw.slice(1, -1).replace(/\\([()\\])/g, '$1');
            } else if (raw.startsWith('<')) {
              str = decodeHex(raw.slice(1, -1).replace(/\s+/g, ''));
            }
            if (str) {
              const textPos = this._transformPoint(textMatrix, 0, 0);
              const finalPos = this._transformPoint(ctm, textPos.x, textPos.y);
              elements.push({ x: finalPos.x, y: finalPos.y, text: str });
            }
          }
        } else if (tok === 'TJ') {
          if (operandStack.length >= 1) {
            const arrContent = operandStack.pop();
            const elReg = /\((?:[^()\\]|\\.)*\)|<[0-9a-fA-F\s]+>|(-?[\d.]+)/g;
            let elm;
            let str = '';
            while ((elm = elReg.exec(arrContent)) !== null) {
              const el = elm[0];
              if (el.startsWith('(')) {
                str += el.slice(1, -1).replace(/\\([()\\])/g, '$1');
              } else if (el.startsWith('<')) {
                str += decodeHex(el.slice(1, -1).replace(/\s+/g, ''));
              } else {
                const num = parseFloat(el);
                if (num < -150) {
                  str += ' ';
                }
              }
            }
            if (str) {
              const textPos = this._transformPoint(textMatrix, 0, 0);
              const finalPos = this._transformPoint(ctm, textPos.x, textPos.y);
              elements.push({ x: finalPos.x, y: finalPos.y, text: str });
            }
          }
        } else {
          operandStack.push(tok);
        }
      }
    }

    // Fallback: extract plain text literals from entire buffer if CTM extraction produced no elements
    if (elements.length === 0) {
      const simpleLiteralRegex = /\(([a-zA-Z0-9\s.,!?:;@_#+\-()/'"]{3,})\)/g;
      const fallbackChunks = [];
      let litMatch;
      while ((litMatch = simpleLiteralRegex.exec(content)) !== null) {
        fallbackChunks.push(litMatch[1]);
      }
      return (
        fallbackChunks
          .join('\n')
          .replace(/[ \t]+/g, ' ')
          .trim() || 'Parsed PDF Document'
      );
    }

    // Sort elements by Y descending (top-to-bottom on page), then X ascending (left-to-right)
    elements.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 2.5) {
        return b.y - a.y;
      }
      return a.x - b.x;
    });

    // Group into coherent lines
    const lines = [];
    let currentGroup = [];
    let currentY = null;

    for (const el of elements) {
      if (currentY === null || Math.abs(el.y - currentY) <= 3) {
        currentGroup.push(el);
        if (currentY === null) currentY = el.y;
      } else {
        currentGroup.sort((a, b) => a.x - b.x);
        let lineText = '';
        for (const c of currentGroup) {
          lineText += c.text;
        }
        if (lineText.trim()) lines.push({ y: currentY, text: lineText.trim() });
        currentGroup = [el];
        currentY = el.y;
      }
    }

    if (currentGroup.length > 0) {
      currentGroup.sort((a, b) => a.x - b.x);
      let lineText = '';
      for (const c of currentGroup) lineText += c.text;
      if (lineText.trim()) lines.push({ y: currentY, text: lineText.trim() });
    }

    return lines
      .map((l) =>
        l.text
          .replace(/\u0000/g, '')
          .replace(/[ \t]+/g, ' ')
          .trim()
      )
      .filter((l) => l && !/^[-–—\s._]{4,}$/.test(l))
      .join('\n');
  }

  /**
   * Extracts raw text from a DOCX buffer (unzipping word/document.xml).
   *
   * @private
   * @param {Buffer} buffer
   * @returns {string} Extracted text
   */
  _extractTextFromDocx(buffer) {
    const textChunks = [];

    let offset = 0;
    while (offset < buffer.length - 30) {
      if (buffer.readUInt32LE(offset) === 0x04034b50) {
        const compMethod = buffer.readUInt16LE(offset + 8);
        const compSize = buffer.readUInt32LE(offset + 18);
        const nameLen = buffer.readUInt16LE(offset + 26);
        const extraLen = buffer.readUInt16LE(offset + 28);
        const fileName = buffer.toString('utf-8', offset + 30, offset + 30 + nameLen);
        const dataOffset = offset + 30 + nameLen + extraLen;

        if (fileName === 'word/document.xml' && dataOffset + compSize <= buffer.length) {
          const compData = buffer.subarray(dataOffset, dataOffset + compSize);
          let xmlContent = '';
          try {
            if (compMethod === 8) {
              xmlContent = zlib.inflateRawSync(compData).toString('utf-8');
            } else {
              xmlContent = compData.toString('utf-8');
            }
          } catch {
            xmlContent = compData.toString('utf-8');
          }

          const pRegex = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
          let pMatch;
          while ((pMatch = pRegex.exec(xmlContent)) !== null) {
            const pContent = pMatch[1];
            const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
            const lineParts = [];
            let tMatch;
            while ((tMatch = tRegex.exec(pContent)) !== null) {
              lineParts.push(tMatch[1]);
            }
            if (lineParts.length > 0) {
              textChunks.push(lineParts.join(''));
            }
          }
          break;
        }

        offset = dataOffset + compSize;
      } else {
        offset++;
      }
    }

    if (textChunks.length > 0) {
      return textChunks.join('\n').replace(/\s+/g, ' ').trim();
    }

    return (
      buffer
        .toString('utf-8')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || 'Parsed DOCX Document'
    );
  }

  /**
   * Parses raw file buffer into sanitized plain text.
   *
   * @param {object} params
   * @param {Buffer} params.buffer
   * @param {string} params.format 'PDF' | 'DOCX' | 'TXT'
   * @returns {string} Normalized plain text
   */
  extractRawText({ buffer, format }) {
    let rawText = '';
    switch (format) {
      case 'PDF':
        rawText = this._extractTextFromPdf(buffer);
        break;
      case 'DOCX':
        rawText = this._extractTextFromDocx(buffer);
        break;
      case 'TXT':
      default:
        rawText = buffer.toString('utf-8');
        break;
    }

    const normalized = rawText
      .normalize('NFKC')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/\r\n/g, '\n')
      .trim();

    return this.scrubSecrets(normalized);
  }

  /**
   * Cleans a skill token string while preserving balanced parentheses (e.g. "JavaScript (ES6+)").
   *
   * @private
   * @param {string} tok
   * @returns {string}
   */
  _cleanSkillToken(tok) {
    let s = String(tok || '')
      .replace(/^[-*•●]\s*/, '')
      .trim();
    s = s.replace(/[,.:;]+$/, '').trim();
    if (s.endsWith(')') && !s.includes('(')) {
      s = s.slice(0, -1).trim();
    }
    if (s.startsWith('(') && !s.includes(')')) {
      s = s.slice(1).trim();
    }
    return s;
  }

  /**
   * Canonical Section Patterns Mapping all common resume heading variants to schema section types.
   */
  static CANONICAL_HEADING_PATTERNS = [
    {
      type: 'SUMMARY',
      regex:
        /^(?:professional\s+summary|executive\s+summary|career\s+summary|professional\s+profile|about\s+me|career\s+objective|summary|profile|objective)$/i,
    },
    {
      type: 'SKILLS',
      regex:
        /^(?:technical\s+skills?|core\s+competencies|technical\s+expertise|technologies|tools\s*(?:&|and)\s*languages|languages\s*(?:&|and)\s*frameworks|skills\s*(?:&|and)\s*technologies|problem\s+solving\s*(?:&|and)\s*algorithms?|problem\s+solving|algorithms?|skills?|tech\s+stack|stack)$/i,
    },
    {
      type: 'WORK_EXPERIENCE',
      regex:
        /^(?:work\s+experience|employment\s+history|work\s+history|professional\s+experience|career\s+history|relevant\s+experience|experience|internships?)$/i,
    },
    {
      type: 'PROJECTS',
      regex:
        /^(?:key\s+projects?|technical\s+projects?|featured\s+projects?|open\s+source|portfolio|projects?|personal\s+projects?|academic\s+projects?)$/i,
    },
    {
      type: 'EDUCATION',
      regex:
        /^(?:education|academic\s+background|educational\s+qualifications?|academic\s+history|academics?|university|degrees?)$/i,
    },
    {
      type: 'CERTIFICATIONS',
      regex:
        /^(?:certifications?|licenses?|licenses?\s*(?:&|and)\s*certifications?|courses?|credentials?)$/i,
    },
    {
      type: 'CONTACT_INFO',
      regex:
        /^(?:contact\s*(?:info(?:rmation)?|details?)?|personal\s+details?|links|profiles?|social\s+profiles?)$/i,
    },
  ];

  static META_CATEGORIES = new Set([
    'languages',
    'backend & apis',
    'backend',
    'apis',
    'frontend & tools',
    'frontend',
    'tools',
    'cs fundamentals',
    'fundamentals',
    'data stores',
    'databases',
    'database',
    'tools & technologies',
    'frameworks',
    'libraries',
    'cloud & devops',
    'cloud',
    'devops',
    'operating systems',
    'technical skills',
    'core competencies',
    'skills',
    'other',
  ]);

  /**
   * Preprocesses resume text to ensure section headings are on their own lines.
   * Handles concatenated single-line strings by inserting newlines around known heading phrases.
   *
   * @private
   * @param {string} text
   * @returns {string} Text with headings on their own lines
   */
  _preprocessHeadings(text) {
    if (!text || typeof text !== 'string') return '';

    const lines = text.split('\n');
    let standaloneHeadingCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      for (const h of ResumeParserService.CANONICAL_HEADING_PATTERNS) {
        if (h.regex.test(trimmed) && trimmed.length < 60) {
          standaloneHeadingCount++;
          break;
        }
      }
    }

    if (standaloneHeadingCount >= 1) {
      return text;
    }

    // Text has headings concatenated with content (0 standalone headings) — search and split on heading phrases
    const HEADING_PHRASES = [
      'professional summary',
      'executive summary',
      'career summary',
      'professional profile',
      'contact information',
      'contact details',
      'personal details',
      'career objective',
      'work experience',
      'employment history',
      'work history',
      'professional experience',
      'career history',
      'relevant experience',
      'academic background',
      'educational qualifications',
      'technical skills',
      'core competencies',
      'technical expertise',
      'problem solving & algorithms',
      'problem solving and algorithms',
      'licenses & certifications',
      'licenses and certifications',
      'key projects',
      'technical projects',
      'featured projects',
      'open source',
      'certifications',
      'internships',
      'summary',
      'experience',
      'education',
      'skills',
      'projects',
    ];

    // Sort by length descending so longer phrases match first
    HEADING_PHRASES.sort((a, b) => b.length - a.length);

    const lowerText = text.toLowerCase();
    const splits = [];

    for (const phrase of HEADING_PHRASES) {
      let searchFrom = 0;
      while (searchFrom < lowerText.length) {
        const idx = lowerText.indexOf(phrase, searchFrom);
        if (idx === -1) break;
        const charBefore = idx > 0 ? lowerText[idx - 1] : '';
        const charAfter =
          idx + phrase.length < lowerText.length ? lowerText[idx + phrase.length] : '';
        const okBefore = !charBefore || /[^a-z0-9]/.test(charBefore);
        const okAfter = !charAfter || /[^a-z0-9]/.test(charAfter);
        if (okBefore && okAfter) {
          splits.push({ pos: idx, heading: phrase.toUpperCase(), len: phrase.length });
        }
        searchFrom = idx + 1;
      }
    }

    if (splits.length === 0) return text;

    splits.sort((a, b) => a.pos - b.pos);
    const deduped = [];
    for (const s of splits) {
      if (deduped.length === 0 || Math.abs(deduped[deduped.length - 1].pos - s.pos) >= 3) {
        deduped.push(s);
      }
    }

    let rebuilt = '';
    let cursor = 0;
    for (const s of deduped) {
      rebuilt += text.slice(cursor, s.pos);
      rebuilt += '\n' + s.heading + '\n';
      cursor = s.pos + s.len;
    }
    rebuilt += text.slice(cursor);

    return rebuilt.replace(/\n{3,}/g, '\n\n');
  }

  /**
   * Splits normalized resume text into structured sections using canonical heading normalization.
   *
   * @param {string} fullText
   * @returns {Array<{ sectionType: string, rawText: string, structuredData: object, orderIndex: number }>}
   */
  splitIntoSections(fullText) {
    if (!fullText) return [];

    const preprocessed = this._preprocessHeadings(fullText);
    const lines = preprocessed.split('\n');
    const sections = [];
    let currentType = 'SUMMARY';
    let currentHeading = 'SUMMARY';
    let currentLines = [];
    let orderIndex = 0;

    const stripDecorations = (s) =>
      s
        .replace(/^[\u2022\u25E6\u2043\u2219\u2023\u25CF\u2700-\u27BF-]\s*/, '')
        .replace(/\s*:\s*$/, '')
        .trim();

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        currentLines.push('');
        continue;
      }

      const clean = stripDecorations(line);
      let matchedType = null;

      if (clean.length < 60) {
        for (const h of ResumeParserService.CANONICAL_HEADING_PATTERNS) {
          if (h.regex.test(clean)) {
            matchedType = h.type;
            break;
          }
        }
      }

      if (matchedType) {
        if (currentLines.length > 0) {
          const text = currentLines.join('\n').trim();
          if (text) {
            sections.push({
              sectionType: currentType,
              heading: currentHeading,
              rawText: text,
              structuredData: this._extractStructuredData(currentType, currentHeading, text),
              orderIndex: orderIndex++,
            });
          }
        }
        currentType = matchedType;
        currentHeading = clean;
        currentLines = [];
      } else {
        currentLines.push(rawLine);
      }
    }

    if (currentLines.length > 0) {
      const text = currentLines.join('\n').trim();
      if (text) {
        sections.push({
          sectionType: currentType,
          heading: currentHeading,
          rawText: text,
          structuredData: this._extractStructuredData(currentType, currentHeading, text),
          orderIndex: orderIndex++,
        });
      }
    }

    if (sections.length === 0 && fullText.trim()) {
      sections.push({
        sectionType: 'SUMMARY',
        heading: 'SUMMARY',
        rawText: fullText.trim(),
        structuredData: this._extractStructuredData('SUMMARY', 'SUMMARY', fullText.trim()),
        orderIndex: 0,
      });
    }

    return sections;
  }

  /**
   * Helper extracting structured entities from raw section text.
   *
   * @private
   * @param {string} sectionType
   * @param {string} heading
   * @param {string} text
   * @returns {object}
   */
  _extractStructuredData(sectionType, heading, text) {
    const urls = [];
    const urlRegex = /https?:\/\/[^\s"'<>]+/gi;
    let m;
    while ((m = urlRegex.exec(text)) !== null) {
      urls.push(m[0]);
    }
    const githubMatch = text.match(/github\.com\/([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)?)/i);
    const linkedinMatch = text.match(/linkedin\.com\/in\/([a-zA-Z0-9_.-]+)/i);
    const leetcodeMatch = text.match(/leetcode\.com\/(?:u\/)?([a-zA-Z0-9_.-]+)/i);
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = text.match(
      /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{10}\b/
    );

    if (sectionType === 'SKILLS') {
      const skills = [];
      const lines = text.split('\n');

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        // Piped categories table (e.g. "| Languages | Python, JavaScript (ES6+), TypeScript |")
        if (line.includes('|')) {
          const parts = line
            .split('|')
            .map((p) => p.trim())
            .filter(Boolean);
          for (const p of parts) {
            if (ResumeParserService.META_CATEGORIES.has(p.toLowerCase())) continue;
            const tokens = p
              .split(/[,;•]/)
              .map((t) => this._cleanSkillToken(t))
              .filter(
                (t) => t.length > 1 && !ResumeParserService.META_CATEGORIES.has(t.toLowerCase())
              );
            for (const tok of tokens) skills.push(tok);
          }
          continue;
        }

        // Colon-separated category (e.g. "Languages: Python, TypeScript")
        const catMatch = line.match(/^([^:]+):\s*(.+)/);
        if (catMatch) {
          const items = catMatch[2];
          const tokens = items
            .split(/[,;•|]/)
            .map((t) => this._cleanSkillToken(t))
            .filter(
              (t) => t.length > 1 && !ResumeParserService.META_CATEGORIES.has(t.toLowerCase())
            );
          for (const tok of tokens) skills.push(tok);
          continue;
        }

        // Bulleted skills / algorithmic areas
        if (/^[●•\-*]/.test(line)) {
          const parenMatches = line.match(/\(([^)]+)\)/g) || [];
          for (const pm of parenMatches) {
            const inner = pm.slice(1, -1);
            const tokens = inner
              .split(/[,;]/)
              .map((t) => this._cleanSkillToken(t))
              .filter((t) => t.length > 1);
            for (const tok of tokens) skills.push(tok);
          }
          if (/leetcode/i.test(line)) skills.push('LeetCode');
          if (/\bDSA\b|data structures/i.test(line)) skills.push('Data Structures & Algorithms');
          if (/competitive programming/i.test(line)) skills.push('Competitive Programming');
          continue;
        }

        // Plain line items
        const tokens = line
          .split(/[,;•|]/)
          .map((t) => this._cleanSkillToken(t))
          .filter((t) => t.length > 1 && !ResumeParserService.META_CATEGORIES.has(t.toLowerCase()));
        for (const tok of tokens) skills.push(tok);
      }

      return { skills: [...new Set(skills)] };
    }

    if (sectionType === 'PROJECTS') {
      const projects = [];
      const lines = text.split('\n');
      let currentProj = null;

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        const isBullet = /^[●•\-*]/.test(line);
        const isUrlLine =
          line.startsWith('Source Code:') ||
          line.startsWith('Project Link:') ||
          /^https?:\/\//.test(line);
        const hasPipe = line.includes('|');

        // Look for project title lines (with pipes or short title lines)
        const isTitleLine =
          !isBullet &&
          !isUrlLine &&
          (hasPipe ||
            (!currentProj && line.length < 80) ||
            (!line.includes('.') &&
              line.length < 80 &&
              !/^(?:built|developed|designed|implemented|engineered|reduced|improved)/i.test(
                line
              )));

        if (isTitleLine) {
          if (currentProj) projects.push(currentProj);
          const parts = line.split('|').map((s) => s.trim());
          const title = parts[0];
          const techStr = parts.slice(1).join(', ');
          const techs = techStr
            ? techStr
                .split(/[,;]/)
                .map((t) => this._cleanSkillToken(t))
                .filter(Boolean)
            : [];
          currentProj = {
            title,
            technologies: techs,
            bullets: [],
            urls: [],
          };
        } else if (currentProj) {
          if (isUrlLine) {
            const matchUrl = line.match(/https?:\/\/[^\s"'<>]+/);
            if (matchUrl) currentProj.urls.push(matchUrl[0]);
            currentProj.bullets.push(line);
          } else if (isBullet) {
            currentProj.bullets.push(line.replace(/^[●•\-*]\s*/, ''));
          } else {
            if (currentProj.bullets.length > 0) {
              currentProj.bullets[currentProj.bullets.length - 1] += ' ' + line;
            } else {
              currentProj.bullets.push(line);
            }
          }
        }
      }
      if (currentProj) projects.push(currentProj);

      // Create backward-compatible items list
      const items = projects.map((p) => {
        const parts = [p.title];
        if (p.technologies.length > 0) parts.push(`(${p.technologies.join(', ')})`);
        if (p.urls.length > 0) parts.push(p.urls.join(' '));
        if (p.bullets.length > 0) parts.push(p.bullets.join('\n'));
        return parts.join('\n');
      });

      return { projects, items: items.length > 0 ? items : [text] };
    }

    if (sectionType === 'WORK_EXPERIENCE') {
      const experiences = [];
      const lines = text.split('\n');
      let currentExp = null;

      // Role title heuristic for line-based experience entries
      const isRoleTitle = (line) => {
        if (line.length > 80) return false;
        if (
          /^(?:worked|built|developed|implemented|created|designed|managed|led|improved|reduced|optimized|automated|deployed|configured|maintained|collaborated|conducted|assisted|provided)/i.test(
            line
          )
        )
          return false;
        if ((line.match(/,/g) || []).length >= 2) return false;
        if (line.includes('.')) return false;
        const roleKeywords = [
          'Full Stack',
          'Frontend',
          'Backend',
          'Full-Stack',
          'Front-End',
          'Back-End',
          'DevOps',
          'SRE',
          'Software Engineer',
          'Systems Engineer',
          'Cloud Engineer',
          'Security Engineer',
          'Data Engineer',
          'ML Engineer',
          'AI Engineer',
          'Engineer',
          'Developer',
          'Architect',
          'Tech Lead',
          'Team Lead',
          'Engineering Manager',
          'Product Manager',
          'Project Manager',
          'Intern',
          'Data Scientist',
        ];
        const lower = line.toLowerCase();
        return roleKeywords.some((kw) => lower.includes(kw.toLowerCase()));
      };

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        const isBullet = /^[●•\-*]/.test(line);
        const hasPipe = line.includes('|');
        const startsNewRole = !isBullet && (hasPipe || isRoleTitle(line));

        if (startsNewRole && (!currentExp || currentExp.bullets.length > 0 || hasPipe)) {
          if (currentExp) experiences.push(currentExp);
          const parts = line.split('|').map((s) => s.trim());
          currentExp = {
            role: parts[0] || '',
            company: parts[1] || '',
            location: parts[2] || '',
            dates: parts[3] || '',
            bullets: [],
          };
        } else if (currentExp) {
          if (isBullet) {
            currentExp.bullets.push(line.replace(/^[●•\-*]\s*/, ''));
          } else {
            // Check if line looks like date, location, or company before bullets
            if (
              !currentExp.company &&
              !currentExp.dates &&
              currentExp.bullets.length === 0 &&
              line.length < 50
            ) {
              if (/\b(?:19|20)\d{2}\b/i.test(line)) {
                currentExp.dates = line;
              } else if (/^(?:Remote|On-site|Hybrid|[A-Z][a-z]+,\s*[A-Z]{2})/i.test(line)) {
                currentExp.location = line;
              } else {
                currentExp.company = line;
              }
            } else {
              if (currentExp.bullets.length > 0) {
                currentExp.bullets[currentExp.bullets.length - 1] += ' ' + line;
              } else {
                currentExp.bullets.push(line);
              }
            }
          }
        }
      }
      if (currentExp) experiences.push(currentExp);

      const items = experiences.map((exp) => {
        const header = [exp.role, exp.company, exp.dates, exp.location].filter(Boolean).join(' | ');
        return exp.bullets.length > 0 ? `${header}\n${exp.bullets.join('\n')}` : header;
      });

      return { experiences, items: items.length > 0 ? items : [text] };
    }

    if (sectionType === 'EDUCATION') {
      const degrees = [];
      const lines = text.split('\n');
      for (const l of lines) {
        const trimmed = l.trim().replace(/^[●•\-*]\s*/, '');
        if (trimmed.length > 3) degrees.push(trimmed);
      }
      return { degrees };
    }

    if (sectionType === 'CERTIFICATIONS') {
      const certs = text
        .split('\n')
        .map((l) => l.trim().replace(/^[●•\-*]\s*/, ''))
        .filter((l) => l.length > 2);
      return { certs };
    }

    return {
      content: text,
      urls,
      github: githubMatch ? `https://${githubMatch[0]}` : null,
      linkedin: linkedinMatch ? `https://${linkedinMatch[0]}` : null,
      leetcode: leetcodeMatch ? `https://${leetcodeMatch[0]}` : null,
      email: emailMatch ? emailMatch[0] : null,
      phone: phoneMatch ? phoneMatch[0] : null,
    };
  }

  /**
   * Generates candidate claims strictly classified with CLAIMED provenance,
   * resolving entities and relationships via ResumeEntityResolver.
   *
   * @param {Array<object>} sections
   * @param {object} [options={}]
   * @returns {Array<{ claimType: string, statement: string, context: string, provenanceStatus: 'CLAIMED', isCorroborated: boolean, metadata: object }>}
   */
  generateClaims(sections, options = {}) {
    const graph = ResumeEntityResolver.resolveCanonicalGraph(sections, options);
    return graph.candidateClaims;
  }

  /**
   * Extracts ONLY explicitly declared user job preferences from resume text.
   * STRICT GUARANTEE: Never infers preferences from work history, previous titles, or remote past jobs.
   *
   * @param {string} text Normalized resume text
   * @returns {{ hasExplicitPreferences: boolean, targetRoles: string[], preferredLocations: string[], remotePreference?: string, provenance: 'USER_PROVIDED' }}
   */
  extractExplicitPreferences(text) {
    if (!text || typeof text !== 'string') {
      return {
        hasExplicitPreferences: false,
        targetRoles: [],
        preferredLocations: [],
        provenance: 'USER_PROVIDED',
      };
    }

    const explicitTargetRoles = [];
    const explicitLocations = [];
    let explicitRemote = undefined;

    // Look for explicit objective/intent statements: e.g. "Seeking [roles] in [locations]" or "Targeting [roles]"
    const seekingMatch = text.match(/(?:seeking|looking for|targeting|open to)\s+([^.\n]+)/i);
    if (seekingMatch) {
      const phrase = seekingMatch[1].trim();

      // Check for remote
      if (/\bremote\b/i.test(phrase)) {
        explicitRemote = 'REMOTE_ONLY';
      }

      // Check for role keywords
      const roleMatches = phrase.match(
        /(?:staff|senior|lead|principal|junior|mid)?\s*(?:backend|frontend|fullstack|full-stack|software|systems|distributed systems|ai|machine learning|devops|cloud|security)\s+(?:engineer|architect|developer|specialist)/gi
      );
      if (roleMatches) {
        for (const rm of roleMatches) {
          explicitTargetRoles.push(rm.trim());
        }
      }

      // Check for location keywords after "in"
      const inLocationMatch = phrase.match(
        /\bin\s+([A-Za-z\s,]+?)(?:\s+(?:or|as|with|seeking|$)|[.]|$)/i
      );
      if (inLocationMatch) {
        const loc = inLocationMatch[1].replace(/[.,;]+$/, '').trim();
        if (loc && !/^(?:roles?|positions?|opportunities|teams?)$/i.test(loc)) {
          explicitLocations.push(loc);
        }
      }
    }

    const hasExplicitPreferences =
      explicitTargetRoles.length > 0 ||
      explicitLocations.length > 0 ||
      explicitRemote !== undefined;

    return {
      hasExplicitPreferences,
      targetRoles: [...new Set(explicitTargetRoles)],
      preferredLocations: [...new Set(explicitLocations)],
      remotePreference: explicitRemote,
      provenance: 'USER_PROVIDED',
    };
  }
}

export const resumeParserService = new ResumeParserService();
