import test from "node:test";
import assert from "node:assert/strict";
import { notificationService } from "../services/notificationService.js";
import { notificationTypes, normalizeLanguage, renderNotification } from "../services/notificationTemplates.js";
import { deliverOutboxRow, processOutbox, deliveryError } from "../services/emailOutbox.js";
import { notificationPool, withTransaction } from "../services/notificationDb.js";

const event = { userTo: 2, userFrom: 1, type: "escrow_invited", objectId: 9, postId: 8 };
const recipient = { email: "recipient@example.com", enabled: 1, language: "es" };
function service({ enabled = true, user = recipient, duplicate = false, failOutbox = false } = {}) {
  const calls = [];
  const create = notificationService({
    emailEnabled: () => enabled,
    transaction: async (work) => work(async (sql, values) => {
      calls.push({ sql, values });
      if (sql.startsWith("INSERT INTO notifications")) return { insertId: 10, affectedRows: duplicate ? 0 : 1 };
      if (sql.startsWith("SELECT")) return user ? [user] : [];
      if (failOutbox) throw new Error("outbox unavailable");
      return { affectedRows: 1 };
    }),
  });
  return { create, calls };
}

test("self notifications are suppressed before any database work, including string IDs", async () => {
  const { create, calls } = service();
  assert.deepEqual(await create({ ...event, userTo: "1" }), { suppressed: true });
  assert.equal(calls.length, 0);
});

test("marketplace event persists both notification and outbox", async () => {
  const { create, calls } = service();
  assert.deepEqual(await create(event), { notificationId: 10, queued: true });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2].values, [10, 2, 1, "escrow_invited", 9, 8]);
});

for (const [name, options] of Object.entries({
  disabled: { enabled: false }, optedOut: { user: { ...recipient, enabled: 0 } },
  missingEmail: { user: { ...recipient, email: "" } }, deletedUser: { user: null }, duplicate: { duplicate: true },
})) {
  test(`${name}: no email is queued`, async () => {
    const { create, calls } = service(options);
    assert.equal((await create(event)).queued, false);
    assert.ok(!calls.some(({ sql }) => sql.startsWith("INSERT INTO email_outbox")));
  });
}

test("all social events remain in-app with correct post IDs", async () => {
  for (const type of ["comment", "reaction", "follow"]) {
    const { create, calls } = service();
    assert.equal((await create({ ...event, type })).queued, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].values[4], 8);
  }
});

test("persistence failures are observable by callers", async () => {
  await assert.rejects(service({ failOutbox: true }).create(event), /outbox unavailable/);
});

test("invalid user, event type and event key are rejected", async () => {
  for (const change of [{ userTo: null }, { type: "message" }, { eventKey: "x".repeat(192) }]) {
    await assert.rejects(service().create({ ...event, ...change }));
  }
});

test("transaction rolls back on outbox failure and releases its dedicated connection", async (t) => {
  const calls = [];
  const connection = {
    query(sql, values, callback) { calls.push(sql); callback(null, {}); },
    release() { calls.push("release"); },
  };
  t.mock.method(notificationPool, "getConnection", (callback) => callback(null, connection));
  await assert.rejects(withTransaction(async (query) => {
    await query("INSERT notification");
    throw new Error("failed outbox");
  }), /failed outbox/);
  assert.deepEqual(calls, ["START TRANSACTION", "INSERT notification", "ROLLBACK", "release"]);
});

test("transaction commits before returning to caller", async (t) => {
  const calls = [];
  t.mock.method(notificationPool, "getConnection", (callback) => callback(null, {
    query(sql, values, done) { calls.push(sql); done(null, {}); },
    release() { calls.push("release"); },
  }));
  assert.equal(await withTransaction(async () => 42), 42);
  assert.deepEqual(calls, ["START TRANSACTION", "COMMIT", "release"]);
});

test("all templates link only to the homepage and show preferences as plain text in en/es", () => {
  for (const type of notificationTypes) {
    for (const language of ["en", "es"]) {
      const mail = renderNotification({ ...event, type }, language, "https://example.com/");
      assert.deepEqual(mail.html.match(/href="[^"]*"/g), ['href="https://example.com"']);
      assert.deepEqual(mail.text.match(/https:\/\/\S+/g), ["https://example.com"]);
      const preferences = language === "en" ? "Manage email preferences in Edit Profile"
        : "Administra tus preferencias de correo en Editar perfil";
      assert.ok(mail.html.includes(`<p>${preferences}</p>`));
      assert.ok(mail.text.endsWith(preferences));
      assert.ok(mail.html.includes(`lang="${language}"`));
      assert.ok(!mail.subject.includes("undefined"));
    }
  }
  for (const input of ["Spanish", "Español", "ES-mx", "es_ES", "es"]) assert.equal(normalizeLanguage(input), "es");
  for (const input of [null, "English", "en-US", "unknown"]) assert.equal(normalizeLanguage(input), "en");
  assert.throws(() => renderNotification(event, "en", "javascript:alert(1)"));
  assert.doesNotThrow(() => renderNotification({ ...event, objectId: null }, "en", "https://example.com"));
});

function delivery({ user = recipient, error, attempts = 1 } = {}) {
  const calls = [], mails = [], logs = [];
  return {
    calls, mails, logs,
    run: () => deliverOutboxRow({
      row: { ...event, id: 3, notificationId: 10, attempts },
      query: async (sql, values) => { calls.push({ sql, values }); return sql.startsWith("SELECT") ? (user ? [user] : []) : {}; },
      sendMail: async (mail) => { mails.push(mail); if (error) throw error; return { accepted: [recipient.email] }; },
      from: { address: "sender@example.com" }, clientUrl: "https://example.com",
      log: (...args) => logs.push(args),
    }),
  };
}

test("delivery uses Spanish and a stable message ID, then records sent time", async () => {
  const d = delivery();
  await d.run();
  assert.match(d.mails[0].subject, /invitado/);
  assert.equal(d.mails[0].messageId, "<notification-10@example.com>");
  assert.ok(d.calls.at(-1).sql.includes("sentAt = NOW()"));
  assert.ok(!JSON.stringify(d.logs).includes(recipient.email));
});

test("worker cancels queued mail after opt-out or recipient deletion", async () => {
  for (const user of [null, { ...recipient, enabled: 0 }]) {
    const d = delivery({ user });
    await d.run();
    assert.equal(d.mails.length, 0);
    assert.ok(d.calls.at(-1).sql.includes("cancelled"));
  }
});

test("temporary SMTP failure backs off; fifth failure exhausts retry budget", async () => {
  const error = Object.assign(new Error("secret email body"), { code: "ETIMEDOUT" });
  for (const attempts of [1, 2, 5]) {
    const d = delivery({ error, attempts });
    await d.run();
    assert.deepEqual(d.calls.at(-1).values, [attempts === 5 ? "failed" : "pending", "ETIMEDOUT", 60 * 2 ** (attempts - 1), 3]);
    assert.ok(!JSON.stringify(d.logs).includes("secret"));
  }
  assert.equal(deliveryError({ code: "private@example.com", response: "secret" }), "DELIVERY_ERROR");
});

test("permanent recipient failure is not retried", async () => {
  const d = delivery({ error: { code: "EENVELOPE", responseCode: 550 } });
  await d.run();
  assert.equal(d.calls.at(-1).values[0], "failed");
});

test("overlapping worker cannot claim or send mail", async () => {
  let queries = 0;
  assert.equal(await processOutbox({ query: async () => { queries++; return [{ acquired: 0 }]; } }), 0);
  assert.equal(queries, 1);
});

test("worker recovers interrupted attempts under lock, and releases lock on failure", async () => {
  const calls = [];
  await assert.rejects(processOutbox({ query: async (sql) => {
    calls.push(sql);
    if (sql.includes("GET_LOCK")) return [{ acquired: 1 }];
    if (sql.startsWith("SELECT *")) throw new Error("database unavailable");
    return {};
  }}), /database unavailable/);
  assert.ok(calls[1].includes("WORKER_INTERRUPTED"));
  assert.ok(calls.at(-1).includes("RELEASE_LOCK"));
});

test("worker claims a job, sends it once and finishes the batch under its lock", async () => {
  const calls = [];
  let selected = false, sent = 0;
  const count = await processOutbox({
    query: async (sql) => {
      calls.push(sql);
      if (sql.includes("GET_LOCK")) return [{ acquired: 1 }];
      if (sql.startsWith("SELECT *")) {
        if (selected) return [];
        selected = true;
        return [{ ...event, id: 3, notificationId: 10, attempts: 0 }];
      }
      if (sql.startsWith("SELECT u.email")) return [recipient];
      return {};
    },
    sendMail: async () => { sent++; return { accepted: [recipient.email] }; },
    from: { address: "sender@example.com" }, clientUrl: "https://example.com", log() {},
  });
  assert.equal(count, 1);
  assert.equal(sent, 1);
  assert.ok(calls.find((sql) => sql.includes("attempts = attempts + 1")));
  assert.ok(calls.find((sql) => sql.includes("sentAt = NOW()")));
  assert.ok(calls.at(-1).includes("RELEASE_LOCK"));
});

test("database failure after SMTP acceptance propagates without recording an SMTP retry", async () => {
  const updates = [];
  await assert.rejects(deliverOutboxRow({
    row: { ...event, id: 3, notificationId: 10, attempts: 1 },
    query: async (sql) => {
      if (sql.startsWith("SELECT")) return [recipient];
      updates.push(sql);
      throw new Error("database unavailable");
    },
    sendMail: async () => ({ accepted: [recipient.email] }),
    clientUrl: "https://example.com", from: { address: "sender@example.com" },
  }), /database unavailable/);
  assert.equal(updates.length, 1);
  assert.ok(updates[0].includes("status = 'sent'"));
});
