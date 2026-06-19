import { db } from "../connect.js";
import moment from "moment";
import { logEvent } from "../utils/escrowLogger.js";
import { sendNotification } from "../utils/notificationHelper.js";

const now = () => moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");

// ─── Helpers ────────────────────────────────────────────────────────────────

const fetchEscrow = (id, cb) => {
    db.query("SELECT * FROM escrows WHERE id = ?", [id], (err, data) => {
        if (err) return cb(err);
        if (!data || data.length === 0) return cb(null, null);
        cb(null, data[0]);
    });
};

// ─── Handlers ───────────────────────────────────────────────────────────────

// POST /api/escrows — admin only (Escrow Lock)
export const createEscrow = (req, res) => {
    const { projectId, studentId } = req.body;

    if (!projectId || !studentId) {
        return res.status(400).json({ error: "projectId and studentId are required." });
    }

    // Derive localId from the project owner — never trust the client for this
    db.query("SELECT userId, status FROM projects WHERE id = ?", [projectId], (err, projects) => {
        if (err) return res.status(500).json(err);
        if (!projects || projects.length === 0) return res.status(404).json({ error: "Project not found." });
        if (projects[0].status !== "open") return res.status(400).json({ error: "Project is not open." });

        const localId = projects[0].userId;

        db.query("SELECT id FROM users WHERE id = ? AND account_type = 'student'", [studentId], (err, students) => {
            if (err) return res.status(500).json(err);
            if (!students || students.length === 0) return res.status(404).json({ error: "Student not found." });

            const q = "INSERT INTO escrows(`projectId`, `studentId`, `localId`, `adminId`, `status`, `pendingAt`, `createdAt`) VALUES (?)";
            const ts = now();
            const values = [projectId, studentId, localId, req.user.id, "pending", ts, ts];

            db.query(q, [values], (err, data) => {
                if (err) return res.status(500).json(err);
                db.query("UPDATE projects SET status = 'in_escrow' WHERE id = ?", [projectId], (err) => {
                    if (err) return res.status(500).json(err);
                    logEvent(db, { escrowId: data.insertId, actorId: req.user.id, actorRole: req.user.account_type, eventType: "escrow_created" });
                    sendNotification(studentId, req.user.id, "escrow_invited", data.insertId);
                    sendNotification(localId,   req.user.id, "escrow_invited", data.insertId);
                    return res.status(201).json({ id: data.insertId });
                });
            });
        });
    });
};

// POST /api/escrows/invite — local-initiated escrow
export const createEscrowByLocal = (req, res) => {
    const { studentId, projectId } = req.body;

    if (!studentId || !projectId) {
        return res.status(400).json({ error: "studentId and projectId are required." });
    }

    // Verify the project belongs to this local
    db.query("SELECT userId, status FROM projects WHERE id = ?", [projectId], (err, projects) => {
        if (err) return res.status(500).json(err);
        if (!projects || projects.length === 0) return res.status(404).json({ error: "Project not found." });
        if (projects[0].userId !== req.user.id) return res.status(403).json({ error: "You can only invite students to your own projects." });
        if (projects[0].status !== "open") return res.status(400).json({ error: "Project is not open." });

        // Verify the target user is a student
        db.query("SELECT id FROM users WHERE id = ? AND account_type = 'student'", [studentId], (err, students) => {
            if (err) return res.status(500).json(err);
            if (!students || students.length === 0) return res.status(404).json({ error: "Student not found." });

            const q = "INSERT INTO escrows(`projectId`, `studentId`, `localId`, `adminId`, `status`, `pendingAt`, `createdAt`) VALUES (?)";
            const ts = now();
            const values = [projectId, studentId, req.user.id, null, "pending", ts, ts];

            db.query(q, [values], (err, data) => {
                if (err) return res.status(500).json(err);
                db.query("UPDATE projects SET status = 'in_escrow' WHERE id = ?", [projectId], (err) => {
                    if (err) return res.status(500).json(err);
                    logEvent(db, { escrowId: data.insertId, actorId: req.user.id, actorRole: req.user.account_type, eventType: "escrow_created" });
                    sendNotification(studentId, req.user.id, "escrow_invited", data.insertId);
                    return res.status(201).json({ id: data.insertId });
                });
            });
        });
    });
};

// GET /api/escrows — admin only, full list
export const getAllEscrows = (req, res) => {
    const q = `
        SELECT e.*,
            p.title  AS projectTitle,
            s.username AS studentUsername, s.profilePic AS studentProfilePic,
            l.username AS localUsername,   l.profilePic AS localProfilePic,
            a.username AS adminUsername
        FROM escrows AS e
        JOIN projects AS p ON (p.id = e.projectId)
        JOIN users    AS s ON (s.id = e.studentId)
        JOIN users    AS l ON (l.id = e.localId)
        LEFT JOIN users AS a ON (a.id = e.adminId)
        ORDER BY e.createdAt DESC
    `;
    db.query(q, (err, data) => {
        if (err) return res.status(500).json(err);
        return res.status(200).json(data);
    });
};

// GET /api/escrows/mine — student or local sees their own escrows
export const getMyEscrows = (req, res) => {
    const userId = req.user.id;

    const q = `
        SELECT e.*,
            p.title  AS projectTitle,
            s.username AS studentUsername, s.profilePic AS studentProfilePic,
            l.username AS localUsername,   l.profilePic AS localProfilePic
        FROM escrows AS e
        JOIN projects AS p ON (p.id = e.projectId)
        JOIN users    AS s ON (s.id = e.studentId)
        JOIN users    AS l ON (l.id = e.localId)
        WHERE e.studentId = ? OR e.localId = ?
        ORDER BY e.createdAt DESC
    `;
    db.query(q, [userId, userId], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.status(200).json(data);
    });
};

// GET /api/escrows/:id — participants + admin
export const getEscrowById = (req, res) => {
    const escrowId = req.params.id;

    const escrowQ = `
        SELECT e.*,
            p.title AS projectTitle, p.description AS projectDescription,
            p.skills AS projectSkills, p.timeline AS projectTimeline,
            p.deliverables AS projectDeliverables,
            s.username AS studentUsername, s.profilePic AS studentProfilePic,
            l.username AS localUsername,   l.profilePic AS localProfilePic,
            a.username AS adminUsername,
            ar.id AS artifact_id, ar.fileUrl AS artifact_fileUrl,
            ar.description AS artifact_description, ar.createdAt AS artifact_createdAt
        FROM escrows AS e
        JOIN projects AS p ON (p.id = e.projectId)
        JOIN users    AS s ON (s.id = e.studentId)
        JOIN users    AS l ON (l.id = e.localId)
        LEFT JOIN users     AS a  ON (a.id = e.adminId)
        LEFT JOIN artifacts AS ar ON (ar.id = (
            SELECT id FROM artifacts WHERE escrowId = e.id ORDER BY createdAt DESC LIMIT 1
        ))
        WHERE e.id = ?
    `;
    db.query(escrowQ, [escrowId], (err, data) => {
        if (err) return res.status(500).json(err);
        if (!data || data.length === 0) return res.status(404).json({ error: "Escrow not found." });

        const row = data[0];
        const uid  = req.user.id;
        const role = req.user.account_type;
        const isParticipant = row.studentId === uid || row.localId === uid;

        if (role !== "admin" && !isParticipant) {
            return res.status(403).json({ error: "Forbidden." });
        }

        // Pull artifact_* columns into a nested object (null when no artifact exists)
        const { artifact_id, artifact_fileUrl, artifact_description, artifact_createdAt, ...escrow } = row;
        escrow.artifact = artifact_id
            ? { id: artifact_id, fileUrl: artifact_fileUrl, description: artifact_description, createdAt: artifact_createdAt }
            : null;

        // Fetch milestones with their latest artifact each
        const milestonesQ = `
            SELECT m.*,
                ar.id       AS latestArtifact_id,
                ar.fileUrl  AS latestArtifact_fileUrl,
                ar.description AS latestArtifact_description,
                ar.createdAt   AS latestArtifact_createdAt
            FROM milestones AS m
            LEFT JOIN artifacts AS ar ON (ar.id = (
                SELECT id FROM artifacts WHERE milestoneId = m.id ORDER BY createdAt DESC LIMIT 1
            ))
            WHERE m.escrowId = ?
            ORDER BY m.\`order\` ASC
        `;
        db.query(milestonesQ, [escrowId], (err, milestoneRows) => {
            if (err) return res.status(500).json(err);

            escrow.milestones = milestoneRows.map((m) => {
                const {
                    latestArtifact_id, latestArtifact_fileUrl,
                    latestArtifact_description, latestArtifact_createdAt,
                    ...milestone
                } = m;
                milestone.latestArtifact = latestArtifact_id
                    ? { id: latestArtifact_id, fileUrl: latestArtifact_fileUrl, description: latestArtifact_description, createdAt: latestArtifact_createdAt }
                    : null;
                return milestone;
            });

            const total    = milestoneRows.length;
            const approved = milestoneRows.filter((m) => m.status === "approved").length;
            escrow.progress = { total, approved };

            return res.status(200).json(escrow);
        });
    });
};

// GET /api/escrows/:id/events — participants + admin
export const getEscrowEvents = (req, res) => {
    const escrowId = req.params.id;

    db.query("SELECT studentId, localId FROM escrows WHERE id = ?", [escrowId], (err, data) => {
        if (err) return res.status(500).json(err);
        if (!data || data.length === 0) return res.status(404).json({ error: "Escrow not found." });

        const escrow = data[0];
        const uid  = req.user.id;
        const role = req.user.account_type;
        const isParticipant = escrow.studentId === uid || escrow.localId === uid;

        if (role !== "admin" && !isParticipant) {
            return res.status(403).json({ error: "Forbidden." });
        }

        const q = `
            SELECT
                ev.id, ev.escrowId, ev.milestoneId, ev.artifactId,
                ev.actorId, ev.actorRole, ev.eventType, ev.note, ev.createdAt,
                u.username  AS actorUsername,
                u.profilePic AS actorProfilePic,
                m.title     AS milestoneTitle,
                ar.description AS artifactDescription
            FROM escrow_events AS ev
            JOIN users AS u ON (u.id = ev.actorId)
            LEFT JOIN milestones AS m  ON (m.id  = ev.milestoneId)
            LEFT JOIN artifacts  AS ar ON (ar.id = ev.artifactId)
            WHERE ev.escrowId = ?
            ORDER BY ev.createdAt ASC
        `;
        db.query(q, [escrowId], (err, events) => {
            if (err) return res.status(500).json(err);
            return res.status(200).json(events);
        });
    });
};

// PUT /api/escrows/:id/status — role-dependent transitions
export const updateEscrowStatus = (req, res) => {
    const { status: nextStatus } = req.body;
    const uid  = req.user.id;
    const role = req.user.account_type;

    if (!nextStatus) return res.status(400).json({ error: "status is required." });

    fetchEscrow(req.params.id, (err, escrow) => {
        if (err) return res.status(500).json(err);
        if (!escrow) return res.status(404).json({ error: "Escrow not found." });

        const current = escrow.status;

        // Validate transition and caller
        const allowed = isTransitionAllowed(current, nextStatus, role, uid, escrow);
        if (!allowed) {
            return res.status(403).json({ error: `Transition '${current}' → '${nextStatus}' is not permitted for your role.` });
        }

        const timestampField = transitionTimestampField(nextStatus);
        const ts = now();

        const q = timestampField
            ? `UPDATE escrows SET status = ?, ${timestampField} = ? WHERE id = ?`
            : `UPDATE escrows SET status = ? WHERE id = ?`;

        const params = timestampField
            ? [nextStatus, ts, escrow.id]
            : [nextStatus, escrow.id];

        db.query(q, params, (err) => {
            if (err) return res.status(500).json(err);
            if (nextStatus === "cancelled") {
                db.query("UPDATE projects SET status = 'open' WHERE id = ?", [escrow.projectId], (err) => {
                    if (err) return res.status(500).json(err);
                    return res.status(200).json("Status updated.");
                });
            } else {
                return res.status(200).json("Status updated.");
            }
        });
    });
};

// PUT /api/escrows/:id/complete — local marks work as complete (submitted → completed)
export const completeEscrow = (req, res) => {
    fetchEscrow(req.params.id, (err, escrow) => {
        if (err) return res.status(500).json(err);
        if (!escrow) return res.status(404).json({ error: "Escrow not found." });
        if (escrow.localId !== req.user.id) return res.status(403).json({ error: "Forbidden." });
        if (escrow.status !== "submitted") return res.status(409).json({ error: "Only submitted escrows can be completed." });

        db.query(
            "UPDATE escrows SET status = 'completed', resolvedAt = ? WHERE id = ?",
            [now(), escrow.id],
            (err) => {
                if (err) return res.status(500).json(err);
                sendNotification(escrow.studentId, req.user.id, "escrow_completed", escrow.id);
                return res.status(200).json("Escrow completed.");
            }
        );
    });
};

// PUT /api/escrows/:id/reopen — local sends back for revision (submitted → active)
export const reopenEscrow = (req, res) => {
    fetchEscrow(req.params.id, (err, escrow) => {
        if (err) return res.status(500).json(err);
        if (!escrow) return res.status(404).json({ error: "Escrow not found." });
        if (escrow.localId !== req.user.id) return res.status(403).json({ error: "Forbidden." });
        if (escrow.status !== "submitted") return res.status(409).json({ error: "Only submitted escrows can be reopened." });

        db.query(
            "UPDATE escrows SET status = 'active', activeAt = ? WHERE id = ?",
            [now(), escrow.id],
            (err) => {
                if (err) return res.status(500).json(err);
                sendNotification(escrow.studentId, req.user.id, "escrow_reopened", escrow.id);
                return res.status(200).json("Escrow reopened.");
            }
        );
    });
};

// PUT /api/escrows/:id/accept — student accepts a pending invitation
export const acceptEscrow = (req, res) => {
    fetchEscrow(req.params.id, (err, escrow) => {
        if (err) return res.status(500).json(err);
        if (!escrow) return res.status(404).json({ error: "Escrow not found." });
        if (escrow.studentId !== req.user.id) return res.status(403).json({ error: "Forbidden." });
        if (escrow.status !== "pending") return res.status(409).json({ error: "Only pending escrows can be accepted." });

        db.query(
            "UPDATE escrows SET status = 'active', activeAt = ? WHERE id = ?",
            [now(), escrow.id],
            (err) => {
                if (err) return res.status(500).json(err);
                logEvent(db, { escrowId: escrow.id, actorId: req.user.id, actorRole: req.user.account_type, eventType: "student_accepted" });
                sendNotification(escrow.localId, req.user.id, "student_accepted", escrow.id);
                return res.status(200).json("Escrow accepted.");
            }
        );
    });
};

// PUT /api/escrows/:id/cancel — student declines a pending invitation
export const cancelEscrowByStudent = (req, res) => {
    fetchEscrow(req.params.id, (err, escrow) => {
        if (err) return res.status(500).json(err);
        if (!escrow) return res.status(404).json({ error: "Escrow not found." });
        if (escrow.studentId !== req.user.id) return res.status(403).json({ error: "Forbidden." });
        if (escrow.status !== "pending") return res.status(409).json({ error: "Only pending escrows can be declined." });

        db.query(
            "UPDATE escrows SET status = 'cancelled', resolvedAt = ? WHERE id = ?",
            [now(), escrow.id],
            (err) => {
                if (err) return res.status(500).json(err);
                db.query("UPDATE projects SET status = 'open' WHERE id = ?", [escrow.projectId], (err) => {
                    if (err) return res.status(500).json(err);
                    logEvent(db, { escrowId: escrow.id, actorId: req.user.id, actorRole: req.user.account_type, eventType: "student_declined" });
                    sendNotification(escrow.localId, req.user.id, "student_declined", escrow.id);
                    return res.status(200).json("Escrow declined.");
                });
            }
        );
    });
};

// ─── Transition logic ────────────────────────────────────────────────────────

const isTransitionAllowed = (current, next, role, uid, escrow) => {
    // admin can cancel from any state
    if (next === "cancelled" && role === "admin") return true;

    switch (`${current}→${next}`) {
        case "pending→active":
            return role === "admin";
        case "active→submitted":
            return role === "student" && escrow.studentId === uid;
        case "submitted→completed":
            return role === "local" && escrow.localId === uid;
        case "submitted→active":
            return role === "local" && escrow.localId === uid;
        default:
            return false;
    }
};

const transitionTimestampField = (status) => {
    switch (status) {
        case "pending":    return "pendingAt";
        case "active":     return "activeAt";
        case "submitted":  return "submittedAt";
        case "completed":
        case "cancelled":  return "resolvedAt";
        default:           return null;
    }
};
