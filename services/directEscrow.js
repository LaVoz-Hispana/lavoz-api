import { problem } from "./resumeFiles.js";
import { positiveId } from "./studentApplications.js";

// Legacy invitations share the project lock with application selection. A direct
// invitation cannot bypass applications already submitted to this project.
export function directEscrow(transaction) {
  return (actor, body, admin = false) =>
    transaction(async (query) => {
      const projectId = positiveId(body.projectId);
      const studentId = positiveId(body.studentId);
      const [project] = await query(
        "SELECT userId, status FROM projects WHERE id = ? FOR UPDATE",
        [projectId],
      );
      if (!project) throw problem("project_not_found", 404);
      if (!admin && Number(project.userId) !== Number(actor.id))
        throw problem("forbidden", 403);
      if (project.status !== "open") throw problem("project_not_open", 409);
      const applications = await query(
        "SELECT id FROM project_applications WHERE projectId = ? AND status = 'submitted' LIMIT 1",
        [projectId],
      );
      if (applications.length)
        throw problem("application_selection_required", 409);
      const students = await query(
        "SELECT id FROM users WHERE id = ? AND account_type = 'student'",
        [studentId],
      );
      if (!students.length) throw problem("student_not_found", 404);
      const inserted = await query(
        `INSERT INTO escrows (projectId, studentId, localId, adminId, status, pendingAt, createdAt)
      VALUES (?, ?, ?, ?, 'pending', NOW(), NOW())`,
        [projectId, studentId, project.userId, admin ? actor.id : null],
      );
      await query("UPDATE projects SET status = 'in_escrow' WHERE id = ?", [
        projectId,
      ]);
      await query(
        "INSERT INTO escrow_events (escrowId, actorId, actorRole, eventType, createdAt) VALUES (?, ?, ?, 'escrow_created', NOW())",
        [inserted.insertId, actor.id, actor.account_type],
      );
      return { id: inserted.insertId, localId: project.userId, studentId };
    });
}
