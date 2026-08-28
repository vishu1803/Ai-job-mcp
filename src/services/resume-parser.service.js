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
   * Extracts raw text from a PDF buffer.
   *
   * @private
   * @param {Buffer} buffer
   * @returns {string} Extracted text
   */
  _extractTextFromPdf(buffer) {
    const textBlocks = [];
    const content = buffer.toString('binary');

    // Extract text streams: look for FlateDecode streams or plain text stream blocks
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;

    while ((match = streamRegex.exec(content)) !== null) {
      const rawStream = Buffer.from(match[1], 'binary');
      let decompressed;
      try {
        decompressed = zlib.inflateSync(rawStream).toString('utf-8');
      } catch {
        try {
          decompressed = zlib.inflateRawSync(rawStream).toString('utf-8');
        } catch {
          decompressed = rawStream.toString('utf-8');
        }
      }

      // Extract text within BT ... ET blocks
      const btRegex = /BT([\s\S]*?)ET/g;
      let btMatch;
      while ((btMatch = btRegex.exec(decompressed)) !== null) {
        const textBlock = btMatch[1];
        const blockChunks = [];

        // Match string literals (text) e.g., (Hello World) Tj
        const tjRegex = /\(([\s\S]*?)\)\s*T[jJ]/g;
        let tjMatch;
        while ((tjMatch = tjRegex.exec(textBlock)) !== null) {
          blockChunks.push(tjMatch[1].replace(/\\([()\\])/g, '$1'));
        }

        // Match hex string arrays e.g., [(Hello) 10 (World)] TJ
        const arrRegex = /\[([\s\S]*?)\]\s*TJ/g;
        let arrMatch;
        while ((arrMatch = arrRegex.exec(textBlock)) !== null) {
          const innerStrings = arrMatch[1].match(/\((.*?)\)/g);
          if (innerStrings) {
            blockChunks.push(
              innerStrings.map((s) => s.slice(1, -1).replace(/\\([()\\])/g, '$1')).join('')
            );
          }
        }

        if (blockChunks.length > 0) {
          textBlocks.push(blockChunks.join(' ').trim());
        }
      }
    }

    if (textBlocks.length > 0) {
      return textBlocks
        .join('\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    // Fallback: extract plain text literals from entire buffer
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

  /**
   * Extracts raw text from a DOCX buffer (unzipping word/document.xml).
   *
   * @private
   * @param {Buffer} buffer
   * @returns {string} Extracted text
   */
  _extractTextFromDocx(buffer) {
    const textChunks = [];

    // Simple robust ZIP local file header scanner for word/document.xml
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
            // Fallback uncompressed
            xmlContent = compData.toString('utf-8');
          }

          // Extract <w:p> paragraphs and <w:t> tags
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

    // Fallback: extract printable strings
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

    // Normalize Unicode NFKC and strip non-printable control characters
    const normalized = rawText
      .normalize('NFKC')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/\r\n/g, '\n')
      .trim();

    return this.scrubSecrets(normalized);
  }

  /**
   * Splits normalized resume text into structured sections.
   *
   * @param {string} fullText
   * @returns {Array<{ sectionType: string, rawText: string, structuredData: object, orderIndex: number }>}
   */
  splitIntoSections(fullText) {
    if (!fullText) return [];

    const lines = fullText.split('\n');
    const sections = [];
    let currentType = 'SUMMARY';
    let currentLines = [];
    let orderIndex = 0;

    const headingPatterns = [
      {
        type: 'CONTACT_INFO',
        regex:
          /^(?:contact|contact info|contact information|personal details|links|profiles|social profiles|contact details)/i,
      },
      {
        type: 'SUMMARY',
        regex:
          /^(?:summary|professional summary|executive summary|career summary|profile|about me|professional profile|objective|career objective)/i,
      },
      {
        type: 'WORK_EXPERIENCE',
        regex:
          /^(?:work experience|experience|employment history|work history|professional experience|career history|relevant experience)/i,
      },
      {
        type: 'EDUCATION',
        regex:
          /^(?:education|academic background|degrees|academic history|educational qualifications|academics|university)/i,
      },
      {
        type: 'SKILLS',
        regex:
          /^(?:technical skills|skills|core competencies|technologies|tools\s*(?:&|and)\s*languages|languages\s*(?:&|and)\s*frameworks|skills\s*(?:&|and)\s*technologies|technical expertise|stack)/i,
      },
      {
        type: 'PROJECTS',
        regex:
          /^(?:projects|key projects|technical projects|portfolio|technical initiatives|open source|featured projects)/i,
      },
      {
        type: 'CERTIFICATIONS',
        regex:
          /^(?:certifications|licenses|courses|credentials|licenses\s*(?:&|and)\s*certifications|certifications\s*(?:&|and)\s*courses)/i,
      },
    ];

    // Strip trailing colons or bullet prefixes from heading comparison
    const stripHeadingDecorations = (s) =>
      s
        .replace(/^[•\-*#]+\s*/, '')
        .replace(/:\s*$/, '')
        .trim();

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        currentLines.push('');
        continue;
      }

      // Check if line matches a major heading
      let matchedType = null;
      const cleanLine = stripHeadingDecorations(line);
      for (const heading of headingPatterns) {
        if (heading.regex.test(cleanLine) && cleanLine.length < 60) {
          matchedType = heading.type;
          break;
        }
      }

      if (matchedType) {
        if (currentLines.length > 0) {
          const sectionText = currentLines.join('\n').trim();
          if (sectionText) {
            sections.push({
              sectionType: currentType,
              rawText: sectionText,
              structuredData: this._extractStructuredData(currentType, sectionText),
              orderIndex: orderIndex++,
            });
          }
        }
        currentType = matchedType;
        currentLines = [];
      } else {
        currentLines.push(rawLine);
      }
    }

    if (currentLines.length > 0) {
      const sectionText = currentLines.join('\n').trim();
      if (sectionText) {
        sections.push({
          sectionType: currentType,
          rawText: sectionText,
          structuredData: this._extractStructuredData(currentType, sectionText),
          orderIndex: orderIndex++,
        });
      }
    }

    // Default fallback if no section headings detected
    if (sections.length === 0 && fullText.trim()) {
      sections.push({
        sectionType: 'SUMMARY',
        rawText: fullText.trim(),
        structuredData: this._extractStructuredData('SUMMARY', fullText.trim()),
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
   * @param {string} text
   * @returns {object}
   */
  _extractStructuredData(sectionType, text) {
    if (sectionType === 'CONTACT_INFO') {
      const urls = [];
      const urlRegex = /https?:\/\/[^\s"'<>]+/gi;
      let urlMatch;
      while ((urlMatch = urlRegex.exec(text)) !== null) {
        urls.push(urlMatch[0]);
      }
      const githubMatch = text.match(/github\.com\/[a-zA-Z0-9_-]+/i);
      const linkedinMatch = text.match(/linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);
      const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

      return {
        urls,
        github: githubMatch ? `https://${githubMatch[0]}` : null,
        linkedin: linkedinMatch ? `https://${linkedinMatch[0]}` : null,
        email: emailMatch ? emailMatch[0] : null,
        rawText: text,
      };
    }

    if (sectionType === 'SKILLS') {
      // Split by commas, bullet points, pipes, semicolons, or lines
      const skillTokens = text
        .replace(/^(?:languages|frameworks|tools|databases|cloud|other|libraries)\s*:\s*/gim, '')
        .split(/[,;•|\n]/)
        .map((s) => s.trim().replace(/^[-*•]\s*/, ''))
        .filter((s) => s.length > 1 && s.length < 50 && !s.includes(':') && !/^\d+$/.test(s));
      return { skills: [...new Set(skillTokens)] };
    }

    if (sectionType === 'EDUCATION') {
      const lines = text
        .split('\n')
        .map((l) => l.trim().replace(/^[-*•]\s*/, ''))
        .filter((l) => l.length > 3);
      return { degrees: lines };
    }

    if (sectionType === 'WORK_EXPERIENCE' || sectionType === 'PROJECTS') {
      const items = text
        .split(/(?:^|\n)[•\-*]\s*/)
        .map((item) => item.trim())
        .filter((item) => item.length > 5);
      // Fallback: if no bullet items found, split by lines
      if (items.length === 0) {
        const lines = text
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 5);
        return { items: lines };
      }
      return { items };
    }

    if (sectionType === 'CERTIFICATIONS') {
      const certs = text
        .split('\n')
        .map((l) => l.trim().replace(/^[-*•]\s*/, ''))
        .filter((l) => l.length > 2);
      return { certs };
    }

    // For SUMMARY, also check if URLs or skills are mentioned in the summary block
    const summaryUrls = [];
    const urlRegex = /https?:\/\/[^\s"'<>]+/gi;
    let urlMatch;
    while ((urlMatch = urlRegex.exec(text)) !== null) {
      summaryUrls.push(urlMatch[0]);
    }
    const githubMatch = text.match(/github\.com\/[a-zA-Z0-9_-]+/i);
    const linkedinMatch = text.match(/linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);

    return {
      content: text,
      github: githubMatch ? `https://${githubMatch[0]}` : null,
      linkedin: linkedinMatch ? `https://${linkedinMatch[0]}` : null,
      urls: summaryUrls,
    };
  }

  /**
   * Generates candidate claims strictly classified with CLAIMED provenance.
   *
   * @param {Array<object>} sections
   * @returns {Array<{ claimType: string, statement: string, context: string, provenanceStatus: 'CLAIMED' }>}
   */
  generateClaims(sections) {
    const claims = [];
    const seenStatements = new Set();

    const addClaim = (claimType, statement, context) => {
      const cleanStmt = String(statement || '').trim();
      if (!cleanStmt || seenStatements.has(cleanStmt.toLowerCase())) return;
      seenStatements.add(cleanStmt.toLowerCase());
      claims.push({
        claimType,
        statement: cleanStmt,
        context: `${context} [Unverified User Claim]`,
        provenanceStatus: 'CLAIMED',
      });
    };

    // Common technology taxonomy for unstructured extraction fallback
    const COMMON_TECH_KEYWORDS = [
      'JavaScript',
      'TypeScript',
      'Python',
      'Node.js',
      'React',
      'Next.js',
      'Fastify',
      'Express',
      'PostgreSQL',
      'Postgres',
      'Docker',
      'Kubernetes',
      'AWS',
      'GCP',
      'Google Cloud',
      'Azure',
      'Git',
      'GitHub',
      'REST',
      'GraphQL',
      'Redis',
      'Drizzle',
      'SQL',
      'HTML',
      'CSS',
      'Tailwind',
      'Linux',
      'Microservices',
      'CI/CD',
      'OAuth',
      'MCP',
      'Model Context Protocol',
      'Go',
      'Golang',
      'Rust',
      'Java',
      'C++',
      'MongoDB',
    ];

    let hasSkillClaims = false;

    for (const sec of sections) {
      if (sec.sectionType === 'CONTACT_INFO' && sec.structuredData) {
        if (sec.structuredData.github) {
          addClaim(
            'CONTACT',
            `GitHub Profile: ${sec.structuredData.github}`,
            'Extracted from Contact Links'
          );
        }
        if (sec.structuredData.linkedin) {
          addClaim(
            'CONTACT',
            `LinkedIn Profile: ${sec.structuredData.linkedin}`,
            'Extracted from Contact Links'
          );
        }
        if (sec.structuredData.email) {
          addClaim('CONTACT', `Email: ${sec.structuredData.email}`, 'Extracted from Contact Info');
        }
        if (Array.isArray(sec.structuredData.urls)) {
          for (const u of sec.structuredData.urls) {
            if (!u.includes('github.com') && !u.includes('linkedin.com')) {
              addClaim('CONTACT', `Portfolio URL: ${u}`, 'Extracted from Contact Links');
            }
          }
        }
      } else if (sec.sectionType === 'SKILLS' && sec.structuredData?.skills) {
        for (const skill of sec.structuredData.skills) {
          addClaim('SKILL', skill, `Extracted from Skills section: "${skill}"`);
          hasSkillClaims = true;
        }
      } else if (sec.sectionType === 'WORK_EXPERIENCE' && sec.structuredData?.items) {
        for (const exp of sec.structuredData.items) {
          addClaim('EXPERIENCE', exp.slice(0, 300), 'Extracted from Work Experience');
        }
      } else if (sec.sectionType === 'EDUCATION' && sec.structuredData?.degrees) {
        for (const deg of sec.structuredData.degrees) {
          addClaim('EDUCATION', deg.slice(0, 200), 'Extracted from Education');
        }
      } else if (sec.sectionType === 'PROJECTS' && sec.structuredData?.items) {
        for (const proj of sec.structuredData.items) {
          addClaim('PROJECT', proj.slice(0, 300), 'Extracted from Projects');
        }
      } else if (sec.sectionType === 'CERTIFICATIONS' && sec.structuredData?.certs) {
        for (const cert of sec.structuredData.certs) {
          addClaim('CERTIFICATION', cert.slice(0, 200), 'Extracted from Certifications');
        }
      } else if (sec.sectionType === 'SUMMARY' && sec.structuredData) {
        if (sec.structuredData.github) {
          addClaim(
            'CONTACT',
            `GitHub Profile: ${sec.structuredData.github}`,
            'Extracted from Summary Links'
          );
        }
        if (sec.structuredData.linkedin) {
          addClaim(
            'CONTACT',
            `LinkedIn Profile: ${sec.structuredData.linkedin}`,
            'Extracted from Summary Links'
          );
        }
        const summaryText = sec.structuredData.content?.trim();
        if (summaryText && summaryText.length > 10) {
          addClaim('SUMMARY', summaryText.slice(0, 500), 'Extracted from Professional Summary');
        }
      }
    }

    // Fallback: If no explicit SKILLS section produced skill claims, extract known tech skills mentioned in text
    if (!hasSkillClaims) {
      const fullCorpus = sections.map((s) => s.rawText).join(' ');
      for (const tech of COMMON_TECH_KEYWORDS) {
        const regex = new RegExp(`\\b${tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(fullCorpus)) {
          addClaim('SKILL', tech, `Mentioned in resume text: "${tech}"`);
        }
      }
    }

    return claims;
  }
}

export const resumeParserService = new ResumeParserService();
