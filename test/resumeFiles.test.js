import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import {
  MAX_RESUME_BYTES,
  resumeTypes,
  validateResume,
} from "../services/resumeFiles.js";

const pdf = (overrides = {}) => ({
  originalname: "resume.pdf",
  mimetype: resumeTypes[".pdf"],
  buffer: Buffer.from("%PDF-1.7\n1 0 obj<</Type /Catalog>>endobj\n%%EOF"),
  ...overrides,
});
// ZIP fixture with actual central/local headers, including compressed XML entries.
function zip(files) {
  const locals = [],
    central = [];
  let offset = 0;
  for (const [filename, contents] of Object.entries(files)) {
    const name = Buffer.from(filename),
      data = Buffer.from(contents),
      compressed = deflateRawSync(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    locals.push(local, name, compressed);
    central.push(directory, name);
    offset += local.length + name.length + compressed.length;
  }
  const cd = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
const docxFiles = {
  "[Content_Types].xml":
    '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" /></Types>',
  "word/document.xml":
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body /></w:document>',
  "_rels/.rels":
    '<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml" /></Relationships>',
};

test("accepts PDF and DOCX with matching extension, MIME and content", () => {
  assert.equal(validateResume(pdf()).extension, ".pdf");
  assert.equal(
    validateResume(pdf({ originalname: "RESUME.PDF" })).extension,
    ".pdf",
  );
  const docx = {
    originalname: "Resume.docx",
    mimetype: resumeTypes[".docx"],
    buffer: zip(docxFiles),
  };
  assert.equal(validateResume(docx).extension, ".docx");
});
test("rejects mismatched MIME, legacy Word files and executable content renamed as PDF", () => {
  for (const file of [
    pdf({ mimetype: "application/octet-stream" }),
    pdf({ originalname: "resume.doc" }),
    pdf({ buffer: Buffer.from("MZ executable") }),
  ]) {
    assert.throws(
      () => validateResume(file),
      (e) => e.status === 400,
    );
  }
});
test("rejects ZIP masquerading as DOCX, malformed ZIP, and macro payloads", () => {
  for (const buffer of [
    Buffer.from("PK"),
    zip({ "readme.txt": "not a resume" }),
    zip({ ...docxFiles, "word/vbaProject.bin": "macro" }),
  ]) {
    assert.throws(
      () =>
        validateResume({
          originalname: "resume.docx",
          mimetype: resumeTypes[".docx"],
          buffer,
        }),
      { code: "resume_invalid_content" },
    );
  }
});
test("rejects missing/empty and oversized files, accepts the exact 10 MB boundary", () => {
  assert.throws(() => validateResume(), { code: "resume_file_required" });
  assert.throws(() => validateResume(pdf({ buffer: Buffer.alloc(0) })), {
    code: "resume_file_required",
  });
  assert.throws(
    () => validateResume(pdf({ buffer: Buffer.alloc(MAX_RESUME_BYTES + 1) })),
    { status: 413 },
  );
  const buffer = Buffer.alloc(MAX_RESUME_BYTES, 32);
  buffer.write("%PDF-1.7");
  buffer.write("%%EOF", buffer.length - 5);
  assert.equal(validateResume(pdf({ buffer })).sizeBytes, MAX_RESUME_BYTES);
});
test("normalizes filenames before persistence or download headers", () => {
  assert.equal(
    validateResume(pdf({ originalname: "C:\\fakepath\\resume\r\n.pdf" }))
      .originalFileName,
    "resume.pdf",
  );
});
