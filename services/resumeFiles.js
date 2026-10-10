import path from "node:path";
import { inflateRawSync } from "node:zlib";

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
export const resumeTypes = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function problem(code, status = 400) {
  return Object.assign(new Error(code), { code, status });
}

// Read bounded ZIP entries from the central directory; a PK prefix alone is not DOCX.
function validateDocx(buffer) {
  let end = buffer.length - 22;
  const min = Math.max(0, end - 65535);
  while (end >= min && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < min || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6) ||
      end + 22 + buffer.readUInt16LE(end + 20) !== buffer.length) throw new Error("ZIP");
  const count = buffer.readUInt16LE(end + 10);
  const directorySize = buffer.readUInt32LE(end + 12);
  let offset = buffer.readUInt32LE(end + 16);
  if (count > 2000 || offset + directorySize !== end) throw new Error("ZIP");
  const entries = new Map();
  let expanded = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("ZIP");
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const uncompressed = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const local = buffer.readUInt32LE(offset + 42);
    expanded += uncompressed;
    if ((flags & 1) || ![0, 8].includes(method) || expanded > 50 * 1024 * 1024 ||
        entries.has(name) || name.includes("..") || name.startsWith("/") ||
        local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50 ||
        /vbaProject\.bin$/i.test(name)) throw new Error("ZIP");
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    if (start + size > buffer.readUInt32LE(end + 16)) throw new Error("ZIP");
    entries.set(name, { start, size, uncompressed, method });
    offset += 46 + nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
  if (offset !== end) throw new Error("ZIP");
  function xml(name) {
    const entry = entries.get(name);
    if (!entry || entry.uncompressed > MAX_RESUME_BYTES) throw new Error("DOCX");
    const data = buffer.subarray(entry.start, entry.start + entry.size);
    const decoded = entry.method === 8 ? inflateRawSync(data, { maxOutputLength: MAX_RESUME_BYTES }) : data;
    if (decoded.length !== entry.uncompressed) throw new Error("ZIP");
    return decoded.toString("utf8");
  }
  if (!xml("[Content_Types].xml").includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml") ||
      !xml("word/document.xml").includes("http://schemas.openxmlformats.org/wordprocessingml/2006/main") ||
      !xml("_rels/.rels").includes("officeDocument")) throw new Error("DOCX");
}

export function validateResume(file) {
  if (!file?.buffer?.length) throw problem("resume_file_required");
  if (file.buffer.length > MAX_RESUME_BYTES) throw problem("resume_too_large", 413);
  const name = path.basename(file.originalname.replaceAll("\\", "/")).replace(/[\r\n\x00-\x1f]/g, "");
  const extension = path.extname(name).toLowerCase();
  if (!resumeTypes[extension] || resumeTypes[extension] !== file.mimetype || name.length > 255) {
    throw problem("resume_invalid_type");
  }
  try {
    if (extension === ".pdf") {
      if (!/^%PDF-1\.[0-9]|^%PDF-2\.0/.test(file.buffer.subarray(0, 8).toString("ascii")) ||
          !file.buffer.subarray(-1024).includes(Buffer.from("%%EOF"))) throw new Error("PDF");
    } else validateDocx(file.buffer);
  } catch { throw problem("resume_invalid_content"); }
  return { originalFileName: name, mimeType: file.mimetype, sizeBytes: file.buffer.length, extension };
}
