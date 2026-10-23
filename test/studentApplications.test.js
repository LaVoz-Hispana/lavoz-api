import test from "node:test";
import assert from "node:assert/strict";
import { studentApplications } from "../services/studentApplications.js";
import { directEscrow } from "../services/directEscrow.js";
import { notificationPool, withTransaction } from "../services/notificationDb.js";

const student = { id: 2, account_type: "student" };
const provider = { id: 3, account_type: "local" };
const project = { id: 5, userId: 3, status: "open" };
const resume = { id: 7, studentId: 2, label: "Engineering", objectKey: "private/object.pdf", originalFileName: "resume.pdf", mimeType: "application/pdf", isDefault: 1 };
const application = { id: 10, projectId: 5, studentId: 2, resumeId: 7, status: "submitted" };
const file = { originalname: "resume.pdf", mimetype: "application/pdf", buffer: Buffer.from("%PDF-1.7\n%%EOF") };

function fixture(overrides = {}) {
  const calls = [], storageCalls = [];
  const query = async (sql, values = []) => {
    calls.push({ sql, values });
    if (overrides.query) {
      const result = await overrides.query(sql, values);
      if (result !== undefined) return result;
    }
    if (sql.startsWith("SELECT * FROM projects")) return [overrides.project || project];
    if (sql.startsWith("SELECT userId FROM projects")) return [project];
    if (sql.startsWith("SELECT id FROM users")) return [student];
    if (sql.startsWith("SELECT * FROM student_resumes")) return [resume];
    if (sql.startsWith("SELECT id FROM student_resumes")) return [{ id: 7 }];
    if (sql.startsWith("SELECT * FROM project_applications")) return [overrides.application || application];
    if (sql.startsWith("SELECT id, studentId FROM project_applications")) return [{ id: 11, studentId: 4 }];
    if (sql.startsWith("SELECT")) return [];
    return { insertId: 20, affectedRows: 1 };
  };
  const storage = {
    async put(...args) { storageCalls.push(["put", ...args]); return "new/object.pdf"; },
    async remove(key) { storageCalls.push(["remove", key]); },
    async get(key) { storageCalls.push(["get", key]); return { Body: "private data" }; },
  };
  const transaction = overrides.transaction || ((work) => work(query));
  return { calls, query, storageCalls, transaction, service: studentApplications({ transaction, storage }) };
}

test("submit uses the authenticated student and saved resume, leaves project open, creates no escrow", async () => {
  const { service, calls } = fixture();
  assert.deepEqual(await service.submit(student, 5, { resumeId: 7, studentId: 999, note: " Qualified " }), { id: 20, status: "submitted" });
  const insert = calls.find((c) => c.sql.startsWith("INSERT INTO project_applications"));
  assert.deepEqual(insert.values, [5, 2, 7, "Qualified"]);
  assert.equal(calls.some((c) => c.sql.startsWith("INSERT INTO escrows") || c.sql.startsWith("UPDATE projects")), false);
  const notification = calls.find((c) => c.sql.startsWith("INSERT INTO notifications"));
  assert.deepEqual(notification.values.slice(0, 3), [3, 2, "application_submitted"]);
});

test("rejects provider applications and cross-student resume references", async () => {
  const { service, calls } = fixture();
  await assert.rejects(service.submit(provider, 5, { resumeId: 7 }), { status: 403 });
  assert.equal(calls.length, 0);
  const scoped = fixture({ query: (sql, values) => {
    if (sql.startsWith("SELECT * FROM student_resumes")) {
      assert.deepEqual(values, [8, 2]);
      return [];
    }
  } });
  await assert.rejects(scoped.service.submit(student, 5, { resumeId: 8 }), { code: "resume_not_found" });
  assert.equal(scoped.calls.some((c) => c.sql.startsWith("INSERT")), false);
});

test("duplicates (including withdrawn applications) cannot be resubmitted", async () => {
  const { service } = fixture({ query: (sql) => sql.startsWith("SELECT id FROM project_applications") ? [{ id: 10, status: "withdrawn" }] : undefined });
  await assert.rejects(service.submit(student, 5, { resumeId: 7 }), { code: "application_duplicate", status: 409 });
  const raced = fixture({ query: (sql) => { if (sql.startsWith("INSERT INTO project_applications")) throw Object.assign(new Error(), { code: "ER_DUP_ENTRY" }); } });
  await assert.rejects(raced.service.submit(student, 5, { resumeId: 7 }), { code: "application_duplicate" });
});

test("closed projects reject both submission and selection", async () => {
  for (const status of ["closed", "in_escrow"]) {
    const { service, calls } = fixture({ project: { ...project, status } });
    await assert.rejects(service.submit(student, 5, { resumeId: 7 }), { code: "project_not_open" });
    await assert.rejects(service.resolve(provider, 5, 10, "select"), { code: "project_not_open" });
    assert.equal(calls.some((c) => /^(INSERT|UPDATE)/.test(c.sql)), false);
  }
});

test("selection creates pending escrow, resolves other applicants and notifies in the same transaction", async () => {
  const { service, calls } = fixture();
  assert.deepEqual(await service.resolve(provider, 5, 10, "select"), { id: 10, status: "selected", escrowId: 20 });
  assert.match(calls[0].sql, /projects.*FOR UPDATE/);
  assert.ok(calls.some((c) => c.sql.includes("SET status = 'rejected'") && c.values[0] === 5));
  const escrow = calls.find((c) => c.sql.startsWith("INSERT INTO escrows"));
  assert.match(escrow.sql, /NULL, 'pending'/);
  assert.deepEqual(escrow.values, [5, 2, 3]);
  assert.ok(calls.some((c) => c.sql.includes("SET status = 'in_escrow'")));
  const notifications = calls.filter((c) => c.sql.startsWith("INSERT INTO notifications"));
  assert.deepEqual(notifications.map((c) => c.values.slice(0, 3)), [[4, 3, "application_rejected"], [2, 3, "application_selected"]]);
});

test("selection failures roll back and release the actual transaction connection", async (t) => {
  const { query, calls } = fixture({ query: (sql) => { if (sql.startsWith("INSERT INTO escrows")) throw new Error("escrow write failed"); } });
  let released = false;
  t.mock.method(notificationPool, "getConnection", (callback) => callback(null, {
    query(sql, values, done) { query(sql, values).then((rows) => done(null, rows), done); },
    release() { released = true; },
  }));
  const service = studentApplications({ transaction: withTransaction });
  await assert.rejects(service.resolve(provider, 5, 10, "select"), /escrow write failed/);
  assert.equal(calls[0].sql, "START TRANSACTION");
  assert.equal(calls.at(-1).sql, "ROLLBACK");
  assert.equal(calls.some((c) => c.sql === "COMMIT"), false);
  assert.equal(released, true);
});

test("another provider cannot review, select, or reject a project's applicants", async () => {
  const { service, calls } = fixture();
  const outsider = { ...provider, id: 99 };
  await assert.rejects(service.forProject(outsider, 5), { status: 403 });
  for (const action of ["select", "reject"]) await assert.rejects(service.resolve(outsider, 5, 10, action), { status: 403 });
  assert.equal(calls.some((c) => /^(INSERT|UPDATE)/.test(c.sql)), false);
});

test("withdrawal is scoped to the applicant and unavailable after selection", async () => {
  const { service, calls } = fixture();
  await assert.rejects(service.resolve({ ...student, id: 99 }, 5, 10, "withdraw"), { status: 404 });
  assert.deepEqual(await service.resolve(student, 5, 10, "withdraw"), { id: 10, status: "withdrawn" });
  assert.equal(calls.some((c) => c.sql.startsWith("INSERT INTO escrows")), false);
  const selected = fixture({ application: { ...application, status: "selected" } });
  await assert.rejects(selected.service.resolve(student, 5, 10, "withdraw"), { code: "application_resolved" });
});

test("student application query is always filtered to the authenticated account", async () => {
  const { service, calls } = fixture();
  await service.mine(student, 5);
  assert.match(calls[0].sql, /WHERE a.studentId = \? AND a.projectId = \?/);
  assert.deepEqual(calls[0].values, [2, 5]);
  assert.equal(calls[0].sql.includes("objectKey"), false);
});

test("student application DTO excludes identities and private file references even if the query returns extra fields", async () => {
  const { service } = fixture({ query: (sql) => sql.includes("WHERE a.studentId = ?") ? [{
    ...application, studentUsername: "Private Name", studentProfilePic: "photo", objectKey: "private/key",
    resumeLabel: "Engineering", note: "My note", createdAt: "2026-10-01", updatedAt: "2026-10-02",
  }] : undefined });
  const [result] = await service.mine(student, 5);
  for (const key of ["studentId", "studentUsername", "studentProfilePic", "objectKey", "applicant"]) assert.equal(key in result, false);
  assert.equal(result.note, "My note");
  assert.equal(result.resumeLabel, "Engineering");
  assert.equal(result.updatedAt, "2026-10-02");
});

test("only the owner or an explicitly authorized admin can retrieve applicant identities", async () => {
  const { service, calls } = fixture({ query: (sql) => {
    if (sql.startsWith("SELECT id FROM projects")) return [{ id: 5 }];
    if (sql.includes("JOIN users u ON u.id = a.studentId")) return [{ ...application, studentUsername: "Applicant", objectKey: "private/key" }];
  } });
  for (const actor of [student, provider]) await assert.rejects(service.forProjectAdmin(actor, 5), { status: 403 });
  await assert.rejects(service.forProject(student, 5), { status: 403 });
  assert.equal(calls.length, 0);
  for (const result of [await service.forProject(provider, 5), await service.forProjectAdmin({ id: 90, account_type: "admin" }, 5)]) {
    assert.equal(result[0].applicant.username, "Applicant");
    assert.equal(result[0].applicant.id, student.id);
    assert.equal("objectKey" in result[0], false);
  }
});

test("resume downloads permit owner/admin and only the provider with the attached resume", async () => {
  for (const actor of [student, { id: 90, account_type: "local", is_admin: true }, { id: 91, account_type: "admin" }]) {
    const { service, storageCalls } = fixture();
    await service.downloadResume(actor, 7);
    assert.deepEqual(storageCalls, [["get", "private/object.pdf"]]);
  }
  const allowed = fixture({ query: (sql, values) => {
    if (sql.startsWith("SELECT a.id")) {
      assert.deepEqual(values, [7, 3]); assert.match(sql, /a.status IN \('submitted', 'selected'\)/);
      return [{ id: 10 }];
    }
  } });
  await allowed.service.downloadResume(provider, 7);
  for (const actor of [provider, { ...student, id: 44 }]) {
    const denied = fixture();
    await assert.rejects(denied.service.downloadResume(actor, 7), { status: 404 });
    assert.equal(denied.storageCalls.length, 0);
  }
});

test("active resume deletion is rejected; deleting an unused default elects another default", async () => {
  const used = fixture({ query: (sql) => sql.startsWith("SELECT id FROM project_applications") ? [{ id: 10 }] : undefined });
  await assert.rejects(used.service.deleteResume(student, 7), { code: "resume_in_use" });
  assert.equal(used.calls.some((c) => c.sql.startsWith("UPDATE")), false);
  const unused = fixture();
  await unused.service.deleteResume(student, 7);
  assert.ok(unused.calls.some((c) => c.sql.includes("SET deletedAt = NOW(), isDefault = 0")));
  assert.ok(unused.calls.some((c) => c.sql.includes("SET isDefault = 1")));
});

test("replacement creates a new row and preserves the old application file reference", async () => {
  const { service, calls, storageCalls } = fixture();
  await service.uploadResume(student, file, "Updated CV", 7);
  assert.equal(storageCalls.filter((c) => c[0] === "put").length, 1);
  assert.equal(storageCalls.some((c) => c[0] === "remove"), false);
  assert.ok(calls.some((c) => c.sql.startsWith("INSERT INTO student_resumes")));
  assert.equal(calls.some((c) => c.sql.startsWith("UPDATE project_applications")), false);
});

test("new S3 object is cleaned up if saving its database reference fails", async () => {
  const { service, storageCalls } = fixture({ query: (sql) => { if (sql.startsWith("INSERT INTO student_resumes")) throw new Error("db unavailable"); } });
  await assert.rejects(service.uploadResume(student, file, "CV"), /db unavailable/);
  assert.equal(storageCalls.at(-1)[0], "remove");
  assert.equal(storageCalls.at(-1)[1], "new/object.pdf");
});

test("making a default locks the student and clears the previous default first", async () => {
  const { service, calls } = fixture();
  await service.updateResume(student, 7, { isDefault: true });
  assert.match(calls[0].sql, /users.*FOR UPDATE/);
  assert.ok(calls.findIndex((c) => c.sql.includes("SET isDefault = 0")) < calls.findIndex((c) => c.sql.includes("SET label = ?")));
});

test("legacy escrow invitations cannot bypass submitted applications", async () => {
  const { transaction, calls } = fixture({ query: (sql) => {
    if (sql.startsWith("SELECT userId, status FROM projects")) return [project];
    if (sql.startsWith("SELECT id FROM project_applications")) return [{ id: 10 }];
  } });
  await assert.rejects(directEscrow(transaction)(provider, { projectId: 5, studentId: 2 }), { code: "application_selection_required" });
  assert.match(calls[0].sql, /FOR UPDATE/);
  assert.equal(calls.some((c) => /^(INSERT|UPDATE)/.test(c.sql)), false);
});


test("closing a project atomically rejects submitted applications and notifies their owners", async () => {
  const { service, calls } = fixture();
  assert.deepEqual(await service.closeProject(provider, 5), { id: 5, status: "closed" });
  assert.match(calls[0].sql, /FOR UPDATE/);
  assert.ok(calls.some((call) => call.sql.includes("SET status = 'closed'")));
  assert.ok(calls.some((call) => call.sql.includes("SET status = 'rejected'")));
  assert.ok(calls.some((call) => call.sql.startsWith("INSERT INTO notifications") && call.values[0] === 4 && call.values[2] === "application_rejected"));
});

test("closing a project rejects outsiders, students, and projects already in escrow", async () => {
  for (const actor of [student, { ...provider, id: 99 }]) {
    const { service, calls } = fixture();
    await assert.rejects(service.closeProject(actor, 5), { status: 403 });
    assert.equal(calls.some((call) => /^(INSERT|UPDATE)/.test(call.sql)), false);
  }
  const { service } = fixture({ project: { ...project, status: "in_escrow" } });
  await assert.rejects(service.closeProject(provider, 5), { code: "project_not_open" });
});

test("closing a project rolls back if notification persistence fails", async (t) => {
  const { query, calls } = fixture({ query: (sql) => { if (sql.startsWith("INSERT INTO notifications")) throw new Error("notification failed"); } });
  t.mock.method(notificationPool, "getConnection", (callback) => callback(null, {
    query(sql, values, done) { query(sql, values).then((rows) => done(null, rows), done); }, release() {},
  }));
  const service = studentApplications({ transaction: withTransaction });
  await assert.rejects(service.closeProject(provider, 5), /notification failed/);
  assert.equal(calls.at(-1).sql, "ROLLBACK");
  assert.equal(calls.some((call) => call.sql === "COMMIT"), false);
});
