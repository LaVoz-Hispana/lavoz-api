import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../connect.js";
import { notificationPool } from "../services/notificationDb.js";
import { addComment } from "../controllers/comment.js";
import { addLike } from "../controllers/like.js";
import { followUser, unfollowUser } from "../controllers/relationship.js";
import { clearNotifAlert } from "../controllers/notification.js";
import { updateNotificationPreferences } from "../controllers/notificationPreferences.js";
import { createMilestone } from "../controllers/milestone.js";

function response() {
  let resolve;
  const done = new Promise((r) => { resolve = r; });
  return { done, statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { resolve(body); return this; } };
}

function captureNotifications(t) {
  const calls = [];
  t.mock.method(notificationPool, "getConnection", (callback) => callback(null, {
    query(sql, values, done) {
      calls.push({ sql, values });
      done(null, { insertId: 90, affectedRows: 1 });
    }, release() {},
  }));
  return calls;
}

for (const [name, controller] of [["comment", addComment], ["reaction", addLike]]) {
  test(`${name} ignores forged post owner and actor`, async (t) => {
    const calls = captureNotifications(t);
    t.mock.method(db, "query", (sql, values, callback) => {
      if (sql.startsWith("SELECT")) return callback(null, [{ userId: 5 }]);
      assert.ok(values[0].includes(2));
      callback(null, { insertId: 20 });
    });
    const res = response();
    controller({ user: { id: 2 }, body: { userId: 99, postId: 7, postUserId: 99, desc: "hello", reaction: "like" } }, res);
    await res.done;
    const inserted = calls.find(({ sql }) => sql.startsWith("INSERT INTO notifications"));
    assert.deepEqual(inserted.values.slice(0, 3), [5, 2, name]);
    assert.equal(inserted.values[4], 7);
  });

  test(`${name} rejects a missing post before creating content`, async (t) => {
    let calls = 0;
    t.mock.method(db, "query", (sql, values, callback) => { calls++; callback(null, []); });
    const res = response();
    controller({ user: { id: 2 }, body: { postId: 7 } }, res);
    await res.done;
    assert.equal(res.statusCode, 404);
    assert.equal(calls, 1);
  });
}

test("follow ignores supplied follower ID and uses the authenticated actor", async (t) => {
  const calls = captureNotifications(t);
  t.mock.method(db, "query", (sql, values, callback) => {
    if (sql.startsWith("SELECT")) return callback(null, [{ id: 5 }]);
    assert.deepEqual(values, [2, 5, 2, 5]);
    callback(null, { insertId: 20, affectedRows: 1 });
  });
  const res = response();
  followUser({ user: { id: 2 }, body: { followerId: 99, followedId: 5 } }, res);
  await res.done;
  assert.deepEqual(calls.find(({ sql }) => sql.startsWith("INSERT INTO notifications")).values.slice(0, 3), [5, 2, "follow"]);
});

test("unfollow cannot act as another user", async (t) => {
  t.mock.method(db, "query", (sql, values, callback) => {
    assert.deepEqual(values, [2, 5]); callback(null, {});
  });
  const res = response();
  unfollowUser({ user: { id: 2 }, body: { followerId: 99 }, query: { followedId: 5 } }, res);
  await res.done;
});

test("clear alert update is scoped to authenticated recipient", async (t) => {
  t.mock.method(db, "query", (sql, values, callback) => {
    assert.ok(sql.includes("AND userTo = ?"));
    assert.deepEqual(values, [0, 10, 2]); callback(null, {});
  });
  const res = response();
  clearNotifAlert({ user: { id: 2 }, body: { id: 10, userTo: 99 } }, res);
  await res.done;
});

test("preferences reject truthy strings and unsupported language codes", async () => {
  for (const body of [{ marketplaceEmail: "false" }, { marketplaceEmail: true, language: "fr" }]) {
    const res = response();
    await updateNotificationPreferences({ user: { id: 2 }, body }, res);
    assert.equal(res.statusCode, 400);
  }
});

test("preferences cannot be changed for a supplied user ID", async (t) => {
  t.mock.method(notificationPool, "query", (sql, values, callback) => {
    assert.equal(values[0], 2);
    callback(null, sql.startsWith("SELECT") ? [{ marketplaceEmail: 0, language: "es" }] : {});
  });
  const res = response();
  await updateNotificationPreferences({ user: { id: 2 }, body: { userId: 99, marketplaceEmail: false, language: "es" } }, res);
  assert.deepEqual(await res.done, { marketplaceEmail: false, language: "es" });
});

test("adding a milestone queues an email for the student before responding", async (t) => {
  const previousFlag = process.env.NOTIFICATION_EMAIL_ENABLED;
  process.env.NOTIFICATION_EMAIL_ENABLED = "true";
  t.after(() => {
    if (previousFlag === undefined) delete process.env.NOTIFICATION_EMAIL_ENABLED;
    else process.env.NOTIFICATION_EMAIL_ENABLED = previousFlag;
  });
  const calls = [];
  t.mock.method(notificationPool, "getConnection", (callback) => callback(null, {
    query(sql, values, done) {
      calls.push({ sql, values });
      done(null, sql.startsWith("SELECT")
        ? [{ email: "student@example.com", enabled: 1 }]
        : { insertId: 90, affectedRows: 1 });
    },
    release() {},
  }));
  t.mock.method(db, "query", (sql, values, callback) => {
    callback(null, sql.startsWith("SELECT")
      ? [{ id: 25, localId: 94, studentId: 93, status: "active" }]
      : { insertId: 38, affectedRows: 1 });
  });
  const res = response();
  createMilestone({ user: { id: 94, account_type: "local" }, params: { id: "25" }, body: { title: "Deliverable" } }, res);
  await res.done;
  assert.equal(res.statusCode, 201);
  assert.deepEqual(calls.find(({ sql }) => sql.startsWith("INSERT INTO email_outbox")).values,
    [90, 93, 94, "milestone_added", 25, null]);
  assert.equal(calls.at(-1).sql, "COMMIT");
});
