import { problem, validateResume } from "./resumeFiles.js";
import { notificationService } from "./notificationService.js";

const resumeColumns = "id, studentId, label, originalFileName, mimeType, sizeBytes, isDefault, createdAt, updatedAt";
const applicationColumns = `a.id, a.projectId, a.studentId, a.resumeId, a.note, a.status,
  a.createdAt, a.updatedAt, a.resolvedAt, r.label AS resumeLabel, r.originalFileName,
  r.mimeType, p.title AS projectTitle, p.status AS projectStatus,
  (SELECT e.id FROM escrows e WHERE e.projectId = a.projectId AND e.studentId = a.studentId
    ORDER BY e.id DESC LIMIT 1) AS escrowId`;

const applicantColumns = `u.username AS studentUsername, u.name AS studentName,
  u.profilePic AS studentProfilePic, u.city AS studentCity, u.university AS studentUniversity,
  u.major AS studentMajor, u.grad_year AS studentGradYear, u.bio AS studentBio,
  u.skills AS studentSkills`;

function studentApplicationDto(row) {
  return {
    id: row.id,
    projectId: row.projectId,
    resumeId: row.resumeId,
    note: row.note,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt,
    resumeLabel: row.resumeLabel,
    originalFileName: row.originalFileName,
    mimeType: row.mimeType,
    projectTitle: row.projectTitle,
    projectStatus: row.projectStatus,
    escrowId: row.escrowId,
  };
}

function reviewerApplicationDto(row) {
  return {
    ...studentApplicationDto(row),
    applicant: {
      id: row.studentId,
      username: row.studentUsername,
      name: row.studentName,
      profilePic: row.studentProfilePic,
      city: row.studentCity,
      university: row.studentUniversity,
      major: row.studentMajor,
      gradYear: row.studentGradYear,
      bio: row.studentBio,
      skills: row.studentSkills,
    },
  };
}

export function positiveId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw problem("invalid_id");
  return Number(value);
}

function labelValue(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 150) throw problem("resume_label_required");
  return value.trim();
}

function requireRole(actor, role) {
  if (actor.account_type !== role) throw problem("forbidden", 403);
}

function requireAdmin(actor) {
  if (!actor.is_admin && actor.account_type !== "admin") throw problem("forbidden", 403);
}

export function studentApplications({ transaction, storage, emailEnabled = () => false }) {
  const notify = (query, userTo, actor, type, projectId, applicationId) => notificationService({
    transaction: (work) => work(query), emailEnabled,
  })({ userTo, userFrom: actor.id, type, objectId: projectId, eventKey: `${type}:${applicationId}` });

  async function lockStudent(query, actor) {
    requireRole(actor, "student");
    const [user] = await query("SELECT id FROM users WHERE id = ? AND account_type = 'student' FOR UPDATE", [actor.id]);
    if (!user) throw problem("forbidden", 403);
  }
  async function ownedResume(query, actor, id) {
    const [resume] = await query("SELECT * FROM student_resumes WHERE id = ? AND studentId = ? AND deletedAt IS NULL FOR UPDATE", [positiveId(id), actor.id]);
    if (!resume) throw problem("resume_not_found", 404);
    return resume;
  }
  async function projectForUpdate(query, id) {
    const [project] = await query("SELECT * FROM projects WHERE id = ? FOR UPDATE", [positiveId(id)]);
    if (!project) throw problem("project_not_found", 404);
    return project;
  }
  const ensureOpen = (project) => {
    if (project.status !== "open") throw problem("project_not_open", 409);
  };

  return {
    async closeProject(actor, projectId) {
      requireRole(actor, "local");
      return transaction(async (query) => {
        const project = await projectForUpdate(query, projectId);
        if (Number(project.userId) !== Number(actor.id)) throw problem("forbidden", 403);
        ensureOpen(project);
        const activeEscrows = await query("SELECT id FROM escrows WHERE projectId = ? AND status <> 'cancelled' LIMIT 1", [project.id]);
        if (activeEscrows.length) throw problem("project_not_open", 409);
        const submitted = await query("SELECT id, studentId FROM project_applications WHERE projectId = ? AND status = 'submitted' FOR UPDATE", [project.id]);
        await query("UPDATE project_applications SET status = 'rejected', resolvedAt = NOW() WHERE projectId = ? AND status = 'submitted'", [project.id]);
        await query("UPDATE projects SET status = 'closed' WHERE id = ?", [project.id]);
        for (const application of submitted) await notify(query, application.studentId, actor, "application_rejected", project.id, application.id);
        return { id: project.id, status: "closed" };
      });
    },
    async listResumes(actor) {
      requireRole(actor, "student");
      return transaction((query) => query(`SELECT ${resumeColumns},
        EXISTS(SELECT 1 FROM project_applications a WHERE a.resumeId = student_resumes.id AND a.status = 'submitted') AS inUse
        FROM student_resumes WHERE studentId = ? AND deletedAt IS NULL ORDER BY isDefault DESC, createdAt DESC, id DESC`, [actor.id]));
    },
    async uploadResume(actor, file, label, replaceId) {
      requireRole(actor, "student");
      const metadata = validateResume(file);
      label = labelValue(label);
      if (replaceId) positiveId(replaceId);
      // Check ownership before writing an object, then recheck under lock at commit.
      if (replaceId) await transaction((query) => ownedResume(query, actor, replaceId));
      const objectKey = await storage.put(actor.id, file, metadata);
      try {
        return await transaction(async (query) => {
          await lockStudent(query, actor);
          const old = replaceId ? await ownedResume(query, actor, replaceId) : null;
          const defaults = await query("SELECT id FROM student_resumes WHERE studentId = ? AND isDefault = 1 AND deletedAt IS NULL", [actor.id]);
          const isDefault = Boolean(old?.isDefault) || defaults.length === 0;
          // Replacement is a new immutable file reference. Applications retain the old row/object.
          if (old) await query("UPDATE student_resumes SET deletedAt = NOW(), isDefault = 0 WHERE id = ?", [old.id]);
          const inserted = await query(`INSERT INTO student_resumes
            (studentId, label, objectKey, originalFileName, mimeType, sizeBytes, isDefault) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [actor.id, label, objectKey, metadata.originalFileName, metadata.mimeType, metadata.sizeBytes, isDefault]);
          const [resume] = await query(`SELECT ${resumeColumns} FROM student_resumes WHERE id = ?`, [inserted.insertId]);
          return resume;
        });
      } catch (error) {
        try { await storage.remove(objectKey); } catch { console.error("resume_orphan_cleanup_failed"); }
        throw error;
      }
    },
    async updateResume(actor, id, body = {}) {
      requireRole(actor, "student");
      if (body.label === undefined && body.isDefault !== true) throw problem("resume_invalid_update");
      if (body.isDefault !== undefined && body.isDefault !== true) throw problem("resume_invalid_update");
      const label = body.label === undefined ? undefined : labelValue(body.label);
      return transaction(async (query) => {
        await lockStudent(query, actor);
        const resume = await ownedResume(query, actor, id);
        if (body.isDefault) {
          await query("UPDATE student_resumes SET isDefault = 0 WHERE studentId = ? AND isDefault = 1", [actor.id]);
        }
        await query("UPDATE student_resumes SET label = ?, isDefault = ? WHERE id = ?", [label ?? resume.label, body.isDefault ?? resume.isDefault, resume.id]);
        const [result] = await query(`SELECT ${resumeColumns} FROM student_resumes WHERE id = ?`, [resume.id]);
        return result;
      });
    },
    async deleteResume(actor, id) {
      requireRole(actor, "student");
      return transaction(async (query) => {
        await lockStudent(query, actor);
        const resume = await ownedResume(query, actor, id);
        const active = await query("SELECT id FROM project_applications WHERE resumeId = ? AND status = 'submitted' LIMIT 1", [resume.id]);
        if (active.length) throw problem("resume_in_use", 409);
        // Retain objects for application history; no public URLs or dangling references.
        await query("UPDATE student_resumes SET deletedAt = NOW(), isDefault = 0 WHERE id = ?", [resume.id]);
        if (resume.isDefault) {
          await query("UPDATE student_resumes SET isDefault = 1 WHERE studentId = ? AND deletedAt IS NULL ORDER BY createdAt DESC, id DESC LIMIT 1", [actor.id]);
        }
      });
    },
    async downloadResume(actor, id) {
      const resume = await transaction(async (query) => {
        const [row] = await query("SELECT * FROM student_resumes WHERE id = ?", [positiveId(id)]);
        if (!row) throw problem("resume_not_found", 404);
        const owner = actor.account_type === "student" && Number(row.studentId) === Number(actor.id);
        if (!owner && !actor.is_admin && actor.account_type !== "admin") {
          if (actor.account_type !== "local") throw problem("resume_not_found", 404);
          const access = await query(`SELECT a.id FROM project_applications a JOIN projects p ON p.id = a.projectId
            WHERE a.resumeId = ? AND p.userId = ? AND a.status IN ('submitted', 'selected') LIMIT 1`, [row.id, actor.id]);
          if (!access.length) throw problem("resume_not_found", 404);
        }
        return row;
      });
      return { resume, object: await storage.get(resume.objectKey) };
    },
    async submit(actor, projectId, body = {}) {
      requireRole(actor, "student");
      const resumeId = positiveId(body.resumeId);
      if (body.note != null && (typeof body.note !== "string" || body.note.length > 4000)) throw problem("application_invalid_note");
      try {
        return await transaction(async (query) => {
          const project = await projectForUpdate(query, projectId);
          ensureOpen(project);
          if (Number(project.userId) === Number(actor.id)) throw problem("forbidden", 403);
          await lockStudent(query, actor);
          await ownedResume(query, actor, resumeId);
          const previous = await query("SELECT id FROM project_applications WHERE projectId = ? AND studentId = ?", [project.id, actor.id]);
          if (previous.length) throw problem("application_duplicate", 409);
          const inserted = await query("INSERT INTO project_applications (projectId, studentId, resumeId, note) VALUES (?, ?, ?, ?)",
            [project.id, actor.id, resumeId, body.note?.trim() || null]);
          await notify(query, project.userId, actor, "application_submitted", project.id, inserted.insertId);
          return { id: inserted.insertId, status: "submitted" };
        });
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY") throw problem("application_duplicate", 409);
        throw error;
      }
    },
    async mine(actor, projectId) {
      requireRole(actor, "student");
      return transaction(async (query) => {
        const rows = await query(`SELECT ${applicationColumns} FROM project_applications a
          JOIN student_resumes r ON r.id = a.resumeId JOIN projects p ON p.id = a.projectId
          WHERE a.studentId = ? ${projectId ? "AND a.projectId = ?" : ""} ORDER BY a.createdAt DESC, a.id DESC`,
        projectId ? [actor.id, positiveId(projectId)] : [actor.id]);
        return rows.map(studentApplicationDto);
      });
    },
    async forProject(actor, projectId) {
      requireRole(actor, "local");
      return transaction(async (query) => {
        const [project] = await query("SELECT userId FROM projects WHERE id = ?", [positiveId(projectId)]);
        if (!project || Number(project.userId) !== Number(actor.id)) throw problem("forbidden", 403);
        const rows = await query(`SELECT ${applicationColumns}, ${applicantColumns} FROM project_applications a
          JOIN student_resumes r ON r.id = a.resumeId JOIN projects p ON p.id = a.projectId
          JOIN users u ON u.id = a.studentId WHERE a.projectId = ? ORDER BY a.createdAt, a.id`, [projectId]);
        return rows.map(reviewerApplicationDto);
      });
    },
    async forProjectAdmin(actor, projectId) {
      requireAdmin(actor);
      return transaction(async (query) => {
        const id = positiveId(projectId);
        const [project] = await query("SELECT id FROM projects WHERE id = ?", [id]);
        if (!project) throw problem("project_not_found", 404);
        const rows = await query(`SELECT ${applicationColumns}, ${applicantColumns} FROM project_applications a
          JOIN student_resumes r ON r.id = a.resumeId JOIN projects p ON p.id = a.projectId
          JOIN users u ON u.id = a.studentId WHERE a.projectId = ? ORDER BY a.createdAt, a.id`, [id]);
        return rows.map(reviewerApplicationDto);
      });
    },
    async resolve(actor, projectId, applicationId, action) {
      requireRole(actor, action === "withdraw" ? "student" : "local");
      if (!["withdraw", "select", "reject"].includes(action)) throw problem("application_invalid_action");
      return transaction(async (query) => {
        const project = await projectForUpdate(query, projectId);
        if (action !== "withdraw" && Number(project.userId) !== Number(actor.id)) throw problem("forbidden", 403);
        ensureOpen(project);
        const [application] = await query("SELECT * FROM project_applications WHERE id = ? AND projectId = ? FOR UPDATE", [positiveId(applicationId), project.id]);
        if (!application || (action === "withdraw" && Number(application.studentId) !== Number(actor.id))) throw problem("application_not_found", 404);
        if (application.status !== "submitted") throw problem("application_resolved", 409);
        const status = { withdraw: "withdrawn", reject: "rejected", select: "selected" }[action];
        await query("UPDATE project_applications SET status = ?, resolvedAt = NOW() WHERE id = ?", [status, application.id]);
        let escrowId;
        if (action === "select") {
          const existing = await query("SELECT id FROM escrows WHERE projectId = ? AND status <> 'cancelled' LIMIT 1", [project.id]);
          if (existing.length) throw problem("project_not_open", 409);
          const others = await query("SELECT id, studentId FROM project_applications WHERE projectId = ? AND status = 'submitted' FOR UPDATE", [project.id]);
          await query("UPDATE project_applications SET status = 'rejected', resolvedAt = NOW() WHERE projectId = ? AND status = 'submitted'", [project.id]);
          const escrow = await query(`INSERT INTO escrows (projectId, studentId, localId, adminId, status, pendingAt, createdAt)
            VALUES (?, ?, ?, NULL, 'pending', NOW(), NOW())`, [project.id, application.studentId, project.userId]);
          escrowId = escrow.insertId;
          await query("UPDATE projects SET status = 'in_escrow' WHERE id = ?", [project.id]);
          await query("INSERT INTO escrow_events (escrowId, actorId, actorRole, eventType, createdAt) VALUES (?, ?, ?, 'escrow_created', NOW())", [escrowId, actor.id, actor.account_type]);
          for (const other of others) await notify(query, other.studentId, actor, "application_rejected", project.id, other.id);
        }
        await notify(query, action === "withdraw" ? project.userId : application.studentId, actor, `application_${status}`, project.id, application.id);
        return { id: application.id, status, ...(escrowId ? { escrowId } : {}) };
      });
    },
  };
}
