// Read-only deployment check: reads schema metadata and EXPLAINs application queries.
import { db } from "../connect.js";
import { getUser, getAllUsers } from "../controllers/user.js";
import { getProjects, getProjectById } from "../controllers/project.js";
import {
  getPosts,
  getProjectPosts,
  getEvents,
  getJobs,
  getShorts,
} from "../controllers/post.js";
import { getServices } from "../controllers/service.js";
import {
  getMessages,
  getAllMessages,
  getMessageParticipant,
} from "../controllers/message.js";
import { getNotifications } from "../controllers/notification.js";
import { getEscrowById } from "../controllers/escrow.js";
import { getEscrowReview } from "../controllers/review.js";
import { studentApplications } from "../services/studentApplications.js";

const rawQuery = db.query.bind(db);
const query = (sql, values = []) =>
  new Promise((resolve, reject) =>
    rawQuery(sql, values, (error, rows) =>
      error ? reject(error) : resolve(rows),
    ),
  );
const required = {
  users: [
    "id",
    "account_type",
    "is_admin",
    "phone",
    "provider_type",
    "contact_person_name",
    "company_name",
    "organization_name",
    "provider_profile_complete",
  ],
  student_resumes: [
    "id",
    "studentId",
    "label",
    "objectKey",
    "originalFileName",
    "mimeType",
    "sizeBytes",
    "isDefault",
    "createdAt",
    "updatedAt",
    "deletedAt",
    "defaultStudentId",
  ],
  project_applications: [
    "id",
    "projectId",
    "studentId",
    "resumeId",
    "note",
    "status",
    "createdAt",
    "updatedAt",
    "resolvedAt",
  ],
  projects: ["id", "userId", "status", "categoryId"],
  escrows: [
    "id",
    "projectId",
    "studentId",
    "localId",
    "adminId",
    "status",
    "pendingAt",
  ],
  notifications: ["type", "eventKey"],
};
let failures = 0;
const fail = (label, detail) => {
  failures++;
  console.log(`FAIL ${label}: ${detail}`);
};
const timeout = setTimeout(() => {
  console.error("Database check timed out.");
  db.destroy();
  process.exit(1);
}, 30000);

try {
  const columns = await query(
    "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()",
  );
  for (const [table, names] of Object.entries(required)) {
    const present = new Set(
      columns
        .filter((row) => row.TABLE_NAME === table)
        .map((row) => row.COLUMN_NAME),
    );
    const missing = names.filter((name) => !present.has(name));
    if (missing.length) fail(table, `missing ${missing.join(", ")}`);
    else console.log(`PASS ${table} columns`);
  }
  const tables = await query(
    "SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()",
  );
  for (const table of [
    "users",
    "projects",
    "escrows",
    "student_resumes",
    "project_applications",
    "notifications",
    "email_outbox",
  ]) {
    if (tables.find((row) => row.TABLE_NAME === table)?.ENGINE !== "InnoDB")
      fail(table, "requires InnoDB for atomic application selection");
  }
  const indexes = await query(
    "SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('student_resumes', 'project_applications') ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX",
  );
  for (const [table, expected] of [
    ["student_resumes", "defaultStudentId"],
    ["project_applications", "projectId,studentId"],
  ]) {
    const unique = new Map();
    for (const row of indexes.filter(
      (row) => row.TABLE_NAME === table && Number(row.NON_UNIQUE) === 0,
    )) {
      unique.set(row.INDEX_NAME, [
        ...(unique.get(row.INDEX_NAME) || []),
        row.COLUMN_NAME,
      ]);
    }
    if (![...unique.values()].some((names) => names.join(",") === expected))
      fail(table, `missing unique constraint on ${expected}`);
    else console.log(`PASS ${table} unique constraint`);
  }
  const notificationType = columns.find(
    (row) => row.TABLE_NAME === "notifications" && row.COLUMN_NAME === "type",
  );
  if (
    !notificationType ||
    !/^varchar/.test(notificationType.COLUMN_TYPE) ||
    Number(notificationType.CHARACTER_MAXIMUM_LENGTH) < 21
  )
    fail("notifications.type", "must support application notification names");

  const checks = [
    getUser,
    getAllUsers,
    getProjects,
    getProjectById,
    getPosts,
    getProjectPosts,
    getEvents,
    getJobs,
    getShorts,
    getServices,
    getMessages,
    getAllMessages,
    getMessageParticipant,
    getNotifications,
    getEscrowById,
    getEscrowReview,
  ];
  for (const controller of checks) {
    const explained = [];
    db.query = (sql, values, callback) => {
      if (typeof values === "function") {
        callback = values;
        values = [];
      }
      if (!/^\s*SELECT\b/i.test(sql))
        throw new Error("Read-only check refused a non-SELECT query");
      const pending = query(`EXPLAIN ${sql}`, values).then(
        () => callback(null, []),
        (error) => {
          fail(controller.name, error.code || "query failed");
          callback(error);
        },
      );
      explained.push(pending);
    };
    const previousFailures = failures;
    const req = {
      user: { id: 1, account_type: "local", is_admin: false },
      query: { userId: undefined },
      params: { id: "1", userId: "1", projectId: "1", escrowId: "1" },
    };
    if (controller === getMessages) req.query.userId = 2;
    const res = {
      status() {
        return this;
      },
      json() {
        return this;
      },
    };
    controller(req, res);
    await Promise.all(explained);
    if (failures === previousFailures)
      console.log(`PASS ${controller.name} SQL`);
  }
  db.query = rawQuery;
  const service = studentApplications({
    transaction: (work) =>
      work(async (sql, values) => {
        if (!/^\s*SELECT\b/i.test(sql))
          throw new Error("Read-only check refused a non-SELECT query");
        await query(`EXPLAIN ${sql}`, values);
        return [];
      }),
  });
  for (const method of ["listResumes", "mine"]) {
    try {
      await service[method]({ id: 1, account_type: "student" });
      console.log(`PASS ${method} SQL`);
    } catch (error) {
      fail(method, error.code || "query failed");
    }
  }
  console.log(
    process.env.RESUME_BUCKET_NAME
      ? "Resume bucket name is configured; live S3 permissions not checked."
      : "ACTION: RESUME_BUCKET_NAME is not configured; resume uploads need a separate private bucket.",
  );
  process.exitCode = failures ? 1 : 0;
} catch (error) {
  console.error(
    `Schema check could not finish: ${error.code || "request_failed"}`,
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  db.query = rawQuery;
  db.end();
}
