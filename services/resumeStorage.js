import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  GetPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";
import "dotenv/config";
import { problem } from "./resumeFiles.js";

const s3 = new S3Client({
  region: process.env.RESUME_BUCKET_REGION || process.env.BUCKET_REGION,
  ...(process.env.ACCESS_KEY && process.env.SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: process.env.ACCESS_KEY,
          secretAccessKey: process.env.SECRET_ACCESS_KEY,
        },
      }
    : {}),
});

function bucket() {
  const name = process.env.RESUME_BUCKET_NAME;
  // The legacy public upload/delete routes use lavozbucket. Never share that bucket.
  if (!name || name === "lavozbucket")
    throw problem("resume_storage_unavailable", 503);
  return name;
}

export const resumeStorage = {
  async put(studentId, file, metadata) {
    const Bucket = bucket();
    const { PublicAccessBlockConfiguration: block } = await s3.send(
      new GetPublicAccessBlockCommand({ Bucket }),
    );
    if (
      ![
        "BlockPublicAcls",
        "IgnorePublicAcls",
        "BlockPublicPolicy",
        "RestrictPublicBuckets",
      ].every((key) => block?.[key])
    ) {
      throw problem("resume_storage_unavailable", 503);
    }
    const Key = `student-resumes/${studentId}/${randomUUID()}${metadata.extension}`;
    await s3.send(
      new PutObjectCommand({
        Bucket,
        Key,
        Body: file.buffer,
        ContentType: metadata.mimeType,
        ServerSideEncryption: "AES256",
      }),
    );
    return Key;
  },
  async remove(Key) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key }));
  },
  async get(Key) {
    return s3.send(new GetObjectCommand({ Bucket: bucket(), Key }));
  },
};
