import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { Readable } from "node:stream";
import {
  resumeRoutes,
  applicationRoutes,
} from "../routes/studentApplications.js";
import { notificationPool } from "../services/notificationDb.js";
import { resumeStorage } from "../services/resumeStorage.js";

test("authenticated resume/application HTTP boundary", async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "resume-route-test-only";
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/resumes", resumeRoutes);
  app.use("/api/applications", applicationRoutes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const headers = (role = "student") => ({
    Authorization: `Bearer ${jwt.sign({ id: 2, account_type: role }, process.env.JWT_SECRET)}`,
  });
  let role = "student",
    queries = [],
    downloads = 0;
  t.mock.method(notificationPool, "getConnection", (callback) =>
    callback(null, {
      query(sql, values, done) {
        queries.push(sql);
        if (sql.startsWith("SELECT id, account_type"))
          return done(null, [{ id: 2, account_type: role, is_admin: 0 }]);
        if (sql.startsWith("SELECT * FROM student_resumes"))
          return done(null, [
            {
              id: 7,
              studentId: 2,
              objectKey: "secret-key",
              originalFileName: "résumé.pdf",
              mimeType: "application/pdf",
            },
          ]);
        done(null, []);
      },
      release() {},
    }),
  );
  t.mock.method(resumeStorage, "get", async () => {
    downloads++;
    return { Body: Readable.from(Buffer.from("%PDF-1.7\n%%EOF")) };
  });

  await t.test(
    "anonymous requests are denied before querying storage/database",
    async () => {
      for (const route of [
        "/resumes",
        "/resumes/7/download",
        "/applications/mine",
        "/applications/projects/5",
      ]) {
        const response = await fetch(base + route);
        assert.equal(response.status, 401);
        assert.equal(
          response.headers.get("cache-control"),
          "private, no-store",
        );
      }
      assert.equal(queries.length, 0);
      assert.equal(downloads, 0);
    },
  );
  await t.test("current database role overrides stale token role", async () => {
    role = "local";
    const response = await fetch(base + "/resumes", {
      headers: headers("student"),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { code: "forbidden" });
    role = "student";
  });
  await t.test("owner gets attachment bytes without an S3 URL", async () => {
    const response = await fetch(base + "/resumes/7/download", {
      headers: headers(),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.match(response.headers.get("content-disposition"), /^attachment;/);
    assert.match(
      response.headers.get("content-disposition"),
      /r%C3%A9sum%C3%A9.pdf/,
    );
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(await response.text(), "%PDF-1.7\n%%EOF");
    assert.equal(downloads, 1);
  });
  await t.test("mismatched multipart file type fails validation", async () => {
    const form = new FormData();
    form.append(
      "file",
      new Blob(["text"], { type: "text/plain" }),
      "resume.pdf",
    );
    form.append("label", "CV");
    const response = await fetch(base + "/resumes", {
      method: "POST",
      headers: headers(),
      body: form,
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { code: "resume_invalid_type" });
  });
  await t.test(
    "multipart uploads over 10 MiB are rejected with 413",
    async () => {
      const form = new FormData();
      form.append(
        "file",
        new Blob([Buffer.alloc(10 * 1024 * 1024 + 1)], {
          type: "application/pdf",
        }),
        "resume.pdf",
      );
      form.append("label", "CV");
      const response = await fetch(base + "/resumes", {
        method: "POST",
        headers: headers(),
        body: form,
      });
      assert.equal(response.status, 413);
      assert.deepEqual(await response.json(), { code: "resume_too_large" });
    },
  );
});
