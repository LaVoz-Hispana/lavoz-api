import test from "node:test";
import assert from "node:assert/strict";
import { S3Client } from "@aws-sdk/client-s3";
import { resumeStorage } from "../services/resumeStorage.js";

test("resume storage refuses missing/public buckets and checks Block Public Access before writing", async (t) => {
  const original = process.env.RESUME_BUCKET_NAME;
  t.after(() => { if (original === undefined) delete process.env.RESUME_BUCKET_NAME; else process.env.RESUME_BUCKET_NAME = original; });
  const sent = [];
  let privateBucket = false;
  t.mock.method(S3Client.prototype, "send", async (command) => {
    sent.push(command);
    return { PublicAccessBlockConfiguration: {
      BlockPublicAcls: privateBucket, IgnorePublicAcls: privateBucket,
      BlockPublicPolicy: privateBucket, RestrictPublicBuckets: privateBucket,
    } };
  });
  const file = { buffer: Buffer.from("pdf") }, metadata = { extension: ".pdf", mimeType: "application/pdf" };
  for (const bucket of ["", "lavozbucket"]) {
    process.env.RESUME_BUCKET_NAME = bucket;
    await assert.rejects(resumeStorage.put(2, file, metadata), { code: "resume_storage_unavailable" });
  }
  assert.equal(sent.length, 0);
  process.env.RESUME_BUCKET_NAME = "test-private-resumes";
  await assert.rejects(resumeStorage.put(2, file, metadata), { code: "resume_storage_unavailable" });
  assert.equal(sent.length, 1);
  privateBucket = true;
  const key = await resumeStorage.put(2, file, metadata);
  assert.match(key, /^student-resumes\/2\/[\w-]+\.pdf$/);
  const write = sent.at(-1).input;
  assert.equal(write.Bucket, "test-private-resumes");
  assert.equal(write.ServerSideEncryption, "AES256");
  assert.equal(write.ACL, undefined);
});
