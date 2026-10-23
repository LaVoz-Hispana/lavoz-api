import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../connect.js";
import { getUser, getAllUsers, updateUser } from "../controllers/user.js";
import { getNotifications } from "../controllers/notification.js";
import { getMessageParticipant, getMessages } from "../controllers/message.js";
import { getRelationships } from "../controllers/relationship.js";
import { getPosts } from "../controllers/post.js";
import { getServices } from "../controllers/service.js";
import { createProject } from "../controllers/project.js";
import { getCompletedProjectsForUser, getUserReviews, getEscrowReview } from "../controllers/review.js";
import { canViewStudentProfile, redactTaggedContent, refreshViewer } from "../services/studentPrivacy.js";
import { validateProviderProfile, providerDisplayName } from "../services/providerIdentity.js";

const student = { id: 2, account_type: "student" };
const provider = { id: 3, account_type: "local" };
const otherStudent = { id: 4, account_type: "student" };
function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("student visibility permits only the owner, providers, and admins", () => {
  for (const actor of [student, provider, { id: 9, account_type: "admin" }, { ...otherStudent, is_admin: true }]) {
    assert.equal(canViewStudentProfile(actor, 2), true);
  }
  for (const actor of [undefined, otherStudent]) assert.equal(canViewStudentProfile(actor, 2), false);
});

test("own profile loads with the deployed users schema and numeric or string owner IDs", (t) => {
  t.mock.method(db, "query", (sql, values, callback) => {
    // The legacy users table has no createdAt column; selecting it breaks every profile.
    assert.doesNotMatch(sql, /u\.createdAt\b/);
    if (sql.includes("FROM student_service_categories")) return callback(null, []);
    assert.deepEqual(values, ["2"]);
    return callback(null, [{ ...student, username: "My Student", email: "owner@example.com" }]);
  });
  for (const ownerId of [2, "2"]) {
    const res = response();
    getUser({ user: { ...student, id: ownerId }, params: { userId: "2" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.id, 2);
    assert.equal(res.body.email, "owner@example.com");
    assert.deepEqual(res.body.serviceCategories, []);
  }
});

test("all account roles can load their own profile but cannot load anyone else's", (t) => {
  let calls = 0;
  t.mock.method(db, "query", (sql, values, callback) => {
    calls++;
    if (sql.includes("FROM student_service_categories")) return callback(null, []);
    callback(null, [{ id: 2, account_type: "local", username: "My Profile" }]);
  });
  for (const actor of [student, { id: 2, account_type: "local" }, { id: 2, account_type: "admin", is_admin: true }]) {
    const own = response();
    getUser({ user: actor, params: { userId: "2" } }, own);
    assert.equal(own.statusCode, 200);
    const before = calls;
    const denied = response();
    getUser({ user: actor, params: { userId: "3" } }, denied);
    assert.equal(denied.statusCode, 403);
    assert.deepEqual(denied.body, { code: "profile_private" });
    assert.equal(calls, before, "other profiles are rejected before any profile query");
  }
});

test("private profile, services, posts, completed projects and reviews refuse another student", (t) => {
  let calls = 0;
  t.mock.method(db, "query", (sql, values, callback) => { calls++; callback(null, [student]); });
  for (const handler of [getUser, getPosts, getServices, getCompletedProjectsForUser, getUserReviews]) {
    const res = response();
    handler({ user: otherStudent, params: { userId: "2" }, query: { userId: "2" } }, res);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { code: "profile_private" });
  }
  assert.equal(calls, 0, "all profile-scoped reads are rejected before querying");
});

test("public and student discovery queries exclude other students and use a bounded DTO", (t) => {
  let sqlSeen, paramsSeen;
  t.mock.method(db, "query", (sql, params, callback) => {
    sqlSeen = sql; paramsSeen = params;
    callback(null, [{ ...provider, username: "provider", email: "private@example.com", phone: "private-phone", contact_person_name: "Private Contact", futurePrivateField: "secret" }]);
  });
  for (const viewer of [undefined, otherStudent]) {
    const res = response();
    getAllUsers({ user: viewer, query: {} }, res);
    assert.match(sqlSeen, /u.account_type <> 'student'/);
    if (viewer) { assert.match(sqlSeen, /OR u.id = \?/); assert.deepEqual(paramsSeen, [4]); }
    for (const key of ["email", "phone", "contact_person_name", "futurePrivateField"]) assert.equal(key in res.body[0], false);
    assert.doesNotMatch(sqlSeen, /SELECT u\.\*/);
  }
});

test("student notification sender aliases are all redacted", (t) => {
  t.mock.method(db, "query", (sql, values, callback) => callback(null, [{ id: 90, userId: 2, userFrom: 2,
    authorAccountType: "student", username: "Private Student", profilePic: "private-photo", type: "follow" }]));
  const res = response();
  getNotifications({ user: otherStudent }, res);
  assert.equal(res.body[0].userId, null);
  assert.equal(res.body[0].userFrom, null);
  assert.equal(res.body[0].profilePic, null);
  assert.equal(res.body[0].username, "Student");
});

test("directory responses never expose full profile contact fields, including to admins", (t) => {
  t.mock.method(db, "query", (sql, values, callback) => callback(null, [{ ...provider, username: "Provider", email: "private@example.com", phone: "private", contact_person_name: "Private Contact" }]));
  const res = response();
  getAllUsers({ user: { id: 9, account_type: "admin", is_admin: true }, query: {} }, res);
  for (const key of ["email", "phone", "contact_person_name"]) assert.equal(key in res.body[0], false);
});

test("message participants use the correct ID for owner visibility and hide other student IDs", (t) => {
  t.mock.method(db, "query", (sql, values, callback) => callback(null, [{ id: 2, authorAccountType: "student", username: "Private Student", name: "Full Name", profilePic: "private-photo" }]));
  for (const actor of [otherStudent, student, provider]) {
    const res = response();
    getMessageParticipant({ user: actor, params: { userId: "2" } }, res);
    const allowed = actor !== otherStudent;
    assert.equal(res.body.id, allowed ? 2 : null);
    assert.equal(res.body.profileVisible, allowed);
    assert.equal(res.body.name, allowed ? "Full Name" : null);
  }
});

test("message sender aliases do not expose a hidden student", (t) => {
  t.mock.method(db, "query", (sql, values, callback) => callback(null, [{ id: 10, userId: 2, msgFrom: 2,
    authorAccountType: "student", username: "Private Student", name: "Full Name", profilePic: "private-photo" }]));
  const res = response();
  getMessages({ user: otherStudent, query: { userId: 2 } }, res);
  assert.equal(res.body[0].userId, null);
  assert.equal(res.body[0].msgFrom, null);
});

test("follower totals retain no hidden student identifiers", (t) => {
  t.mock.method(db, "query", (sql, values, callback) => callback(null, sql.includes("FROM relationships")
    ? [{ followerUserId: 2, account_type: "student" }, { followerUserId: 4, account_type: "student" }, { followerUserId: 3, account_type: "local" }]
    : [provider]));
  const res = response();
  getRelationships({ user: otherStudent, query: { followedUserId: 3 } }, res);
  assert.deepEqual(res.body, [null, 4, 3]);
});

test("project post tags redact hidden student names in content and links", () => {
  const row = { desc: "Thanks @classmate!", article: "Worked with @classmate.", taggedUsers: "2::classmate::student||3::provider::local" };
  const result = redactTaggedContent(row, otherStudent);
  assert.equal(result.desc, "Thanks @Student!");
  assert.equal(result.article, "Worked with @Student.");
  assert.equal(result.taggedUsers, "::Student||3::provider");
  assert.equal(redactTaggedContent(row, provider).desc, row.desc);
});

test("database failures do not return SQL or contact data", (t) => {
  t.mock.method(db, "query", (sql, values, callback) => callback({ sql: "private@example.com", sqlMessage: "Private Student" }));
  const res = response();
  getUser({ user: provider, params: { userId: "3" } }, res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { code: "request_failed" });
});

test("database role refresh revokes stale privileges and recognizes legacy admins", (t) => {
  for (const current of [student, { id: 2, account_type: "admin", is_admin: 0 }]) {
    const mock = t.mock.method(db, "query", (sql, values, callback) => callback(null, [current]));
    const req = { user: { id: 2, account_type: "local", is_admin: true } };
    let next = false;
    refreshViewer(req, response(), () => { next = true; });
    assert.equal(req.user.account_type, current.account_type);
    assert.equal(req.user.is_admin, current.account_type === "admin");
    assert.equal(next, true);
    mock.mock.restore();
  }
});

test("provider types require the correct contact/entity fields and derive their identity", () => {
  for (const type of ["individual", "company", "organization"]) {
    const body = { provider_type: type, contact_person_name: " Jane Smith " };
    if (type !== "individual") body[`${type}_name`] = " Example Entity ";
    const result = validateProviderProfile(body);
    assert.equal(result.error, undefined);
    assert.equal(result.value.contact_person_name, "Jane Smith");
    assert.equal(providerDisplayName({ ...result.value, account_type: "local", username: "login-name" }), type === "individual" ? "Jane Smith" : "Example Entity");
    assert.ok(validateProviderProfile({ ...body, contact_person_name: " " }).error);
    assert.ok(validateProviderProfile({ ...body, [type === "company" ? "organization_name" : "company_name"]: "Contradictory" }).error);
  }
  assert.ok(validateProviderProfile({ provider_type: "company", contact_person_name: "Jane" }).error);
  assert.ok(validateProviderProfile({ provider_type: "invalid", contact_person_name: "Jane" }).error);
});

test("profile updates persist normalized provider fields, clear student fields, and never change roles", (t) => {
  let sqlSeen, valuesSeen;
  t.mock.method(db, "query", (sql, values, callback) => { sqlSeen = sql; valuesSeen = values; callback(null, { affectedRows: 1 }); });
  for (const actor of [provider, student]) {
    const res = response();
    updateUser({ user: actor, body: { account_type: "admin", provider_type: "company", contact_person_name: " Jane ", company_name: " Company " } }, res);
    assert.equal(res.statusCode, 200);
    assert.doesNotMatch(sqlSeen, /`account_type`=/);
    assert.deepEqual(valuesSeen.slice(-6), actor === provider ? ["company", "Jane", "Company", null, true, 3] : [null, null, null, null, false, 2]);
  }
});


test("completed escrow review data is scoped to its participants and the author's own review", (t) => {
  t.mock.method(db, "query", (sql, values, callback) => {
    if (sql.includes("FROM escrows e")) return callback(null, [{ id: 8, studentId: 2, localId: 3, status: "completed", studentUsername: "Student", localUsername: "Company", localProviderTypeLabel: "Company" }]);
    assert.match(sql, /WHERE escrowId = \? AND reviewerId = \?/);
    assert.equal(values[0], 8);
    callback(null, [{ id: 90, rating: 4.5, commentary: "Good work" }]);
  });
  for (const actor of [student, provider]) {
    const res = response();
    getEscrowReview({ user: actor, params: { escrowId: "8" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.review.rating, 4.5);
    assert.equal(res.body.canReview, true);
    assert.equal(res.body.counterpartName, actor === student ? "Company" : "Student");
  }
  const denied = response();
  getEscrowReview({ user: otherStudent, params: { escrowId: "8" } }, denied);
  assert.equal(denied.statusCode, 403);
  assert.deepEqual(denied.body, { code: "forbidden" });
});

test("new projects require title and description before any database work", (t) => {
  let queried = false;
  t.mock.method(db, "query", () => { queried = true; });
  for (const body of [{ categoryId: 1 }, { categoryId: 1, title: " ", description: "Description" }]) {
    const res = response();
    createProject({ user: provider, body }, res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { code: "project_fields_required" });
  }
  assert.equal(queried, false);
});

test("existing incomplete providers are blocked before posting a project", (t) => {
  t.mock.method(db, "query", (sql, values, callback) => {
    assert.match(sql, /SELECT provider_profile_complete/);
    assert.deepEqual(values, [provider.id]);
    callback(null, [{ provider_profile_complete: 0 }]);
  });
  const res = response();
  createProject({ user: provider, body: { categoryId: 1, title: "Project", description: "Description" } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "provider_profile_incomplete");
});

test("project creation uses the authenticated provider and normalized content", (t) => {
  t.mock.method(db, "query", (sql, values, callback) => {
    if (sql.startsWith("SELECT provider_profile_complete")) return callback(null, [{ provider_profile_complete: 1 }]);
    if (sql.startsWith("SELECT id FROM categories")) return callback(null, [{ id: 1 }]);
    assert.match(sql, /INSERT INTO projects/);
    assert.deepEqual(values[0].slice(0, 3), [3, "Project", "Description"]);
    callback(null, { insertId: 5 });
  });
  const res = response();
  createProject({ user: provider, body: { userId: 999, categoryId: 1, title: " Project ", description: " Description " } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { id: 5 });
});
