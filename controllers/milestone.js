import { db } from "../connect.js";
import moment from "moment";
import { logEvent } from "../utils/escrowLogger.js";
import { sendNotification } from "../utils/notificationHelper.js";

const now = () => moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");

const fetchEscrow = (id, cb) => {
    db.query("SELECT * FROM escrows WHERE id = ?", [id], (err, data) => {
        if (err) return cb(err);
        if (!data || data.length === 0) return cb(null, null);
        cb(null, data[0]);
    });
};

// POST /api/escrows/:id/milestones
export const createMilestone = (req, res) => {
    const escrowId = req.params.id;
    const { title, description, dueDate, order } = req.body;

    if (!title) return res.status(400).json({ error: "title is required." });

    fetchEscrow(escrowId, (err, escrow) => {
        if (err) return res.status(500).json(err);
        if (!escrow) return res.status(404).json({ error: "Escrow not found." });
        if (escrow.localId !== req.user.id) return res.status(403).json({ error: "Forbidden." });
        if (!["pending", "active"].includes(escrow.status)) {
            return res.status(409).json({ error: "Milestones can only be added to pending or active escrows." });
        }

        const ts = now();
        const q = "INSERT INTO milestones(`escrowId`, `title`, `description`, `dueDate`, `order`, `status`, `createdAt`, `updatedAt`) VALUES (?)";
        const values = [escrowId, title, description ?? null, dueDate ?? null, order ?? 0, "pending", ts, ts];

        db.query(q, [values], (err, data) => {
            if (err) return res.status(500).json(err);
            logEvent(db, { escrowId: parseInt(escrowId), milestoneId: data.insertId, actorId: req.user.id, actorRole: req.user.account_type, eventType: "milestone_added" });
            sendNotification(escrow.studentId, req.user.id, "milestone_added", parseInt(escrowId));
            return res.status(201).json({ id: data.insertId });
        });
    });
};

// GET /api/escrows/:id/milestones
export const getMilestonesByEscrow = (req, res) => {
    const escrowId = req.params.id;

    db.query("SELECT studentId, localId FROM escrows WHERE id = ?", [escrowId], (err, data) => {
        if (err) return res.status(500).json(err);
        if (!data || data.length === 0) return res.status(404).json({ error: "Escrow not found." });

        const escrow = data[0];
        const uid = req.user.id;
        const isParticipant = escrow.studentId === uid || escrow.localId === uid;

        if (req.user.account_type !== "admin" && !isParticipant) {
            return res.status(403).json({ error: "Forbidden." });
        }

        db.query(
            "SELECT * FROM milestones WHERE escrowId = ? ORDER BY `order` ASC",
            [escrowId],
            (err, milestones) => {
                if (err) return res.status(500).json(err);
                return res.status(200).json(milestones);
            }
        );
    });
};

// PUT /api/escrows/:id/milestones/:mid
export const updateMilestone = (req, res) => {
    const { id: escrowId, mid } = req.params;
    const { title, description, dueDate, order } = req.body;

    fetchEscrow(escrowId, (err, escrow) => {
        if (err) return res.status(500).json(err);
        if (!escrow) return res.status(404).json({ error: "Escrow not found." });
        if (escrow.localId !== req.user.id) return res.status(403).json({ error: "Forbidden." });

        db.query("SELECT * FROM milestones WHERE id = ? AND escrowId = ?", [mid, escrowId], (err, data) => {
            if (err) return res.status(500).json(err);
            if (!data || data.length === 0) return res.status(404).json({ error: "Milestone not found." });

            if (escrow.status !== "pending" && data[0].status !== "pending") {
                return res.status(409).json({ error: "Milestone can only be updated while the escrow or the milestone itself is pending." });
            }

            const m = data[0];
            const ts = now();

            const q = "UPDATE milestones SET `title` = ?, `description` = ?, `dueDate` = ?, `order` = ?, `updatedAt` = ? WHERE id = ?";
            const values = [
                title        !== undefined ? title        : m.title,
                description  !== undefined ? description  : m.description,
                dueDate      !== undefined ? dueDate      : m.dueDate,
                order        !== undefined ? order        : m.order,
                ts,
                mid,
            ];

            db.query(q, values, (err) => {
                if (err) return res.status(500).json(err);
                logEvent(db, { escrowId: parseInt(escrowId), milestoneId: parseInt(mid), actorId: req.user.id, actorRole: req.user.account_type, eventType: "milestone_updated" });
                return res.status(200).json("Milestone updated.");
            });
        });
    });
};

// DELETE /api/escrows/:id/milestones/:mid
export const deleteMilestone = (req, res) => {
    const { id: escrowId, mid } = req.params;

    fetchEscrow(escrowId, (err, escrow) => {
        if (err) return res.status(500).json(err);
        if (!escrow) return res.status(404).json({ error: "Escrow not found." });
        if (escrow.localId !== req.user.id) return res.status(403).json({ error: "Forbidden." });

        db.query("SELECT id, status FROM milestones WHERE id = ? AND escrowId = ?", [mid, escrowId], (err, data) => {
            if (err) return res.status(500).json(err);
            if (!data || data.length === 0) return res.status(404).json({ error: "Milestone not found." });

            if (escrow.status !== "pending" && data[0].status !== "pending") {
                return res.status(409).json({ error: "Milestone can only be deleted while the escrow or the milestone itself is pending." });
            }

            db.query("DELETE FROM milestones WHERE id = ?", [mid], (err) => {
                if (err) return res.status(500).json(err);
                return res.status(200).json("Milestone deleted.");
            });
        });
    });
};

// PUT /api/escrows/:id/milestones/:mid/approve
export const approveMilestone = (req, res) => {
    const { id: escrowId, mid } = req.params;

    fetchEscrow(escrowId, (err, escrow) => {
        if (err) return res.status(500).json(err);
        if (!escrow) return res.status(404).json({ error: "Escrow not found." });
        if (escrow.localId !== req.user.id) return res.status(403).json({ error: "Forbidden." });
        if (!["active", "submitted"].includes(escrow.status)) {
            return res.status(409).json({ error: "Escrow must be active or submitted to approve milestones." });
        }

        db.query("SELECT * FROM milestones WHERE id = ? AND escrowId = ?", [mid, escrowId], (err, data) => {
            if (err) return res.status(500).json(err);
            if (!data || data.length === 0) return res.status(404).json({ error: "Milestone not found." });

            if (data[0].status !== "submitted") {
                return res.status(409).json({ error: "Only submitted milestones can be approved." });
            }

            const ts = now();

            db.query("UPDATE milestones SET status = 'approved', updatedAt = ? WHERE id = ?", [ts, mid], (err) => {
                if (err) return res.status(500).json(err);

                logEvent(db, { escrowId: parseInt(escrowId), milestoneId: parseInt(mid), actorId: req.user.id, actorRole: req.user.account_type, eventType: "milestone_approved" });
                sendNotification(escrow.studentId, req.user.id, "milestone_approved", parseInt(escrowId));

                // Always reset escrow to active — finalization is an explicit action
                db.query(
                    "UPDATE escrows SET status = 'active', activeAt = ? WHERE id = ?",
                    [ts, escrowId],
                    (err) => {
                        if (err) return res.status(500).json(err);
                        return res.status(200).json({ approved: true });
                    }
                );
            });
        });
    });
};

// POST /api/escrows/:id/finalize
export const finalizeEscrow = (req, res) => {
    const escrowId = req.params.id;

    fetchEscrow(escrowId, (err, escrow) => {
        if (err) return res.status(500).json(err);
        if (!escrow) return res.status(404).json({ error: "Escrow not found." });
        if (escrow.localId !== req.user.id) return res.status(403).json({ error: "Forbidden." });
        if (escrow.status !== "active") {
            return res.status(409).json({ error: "Only active escrows can be finalized." });
        }

        const ts = now();

        db.query("UPDATE escrows SET status = 'completed', resolvedAt = ? WHERE id = ?", [ts, escrowId], (err) => {
            if (err) return res.status(500).json(err);
            db.query("UPDATE projects SET status = 'closed' WHERE id = ?", [escrow.projectId], (err) => {
                if (err) return res.status(500).json(err);
                logEvent(db, { escrowId: parseInt(escrowId), actorId: req.user.id, actorRole: req.user.account_type, eventType: "escrow_completed" });
                sendNotification(escrow.studentId, req.user.id, "escrow_completed", parseInt(escrowId));
                return res.status(200).json({ completed: true });
            });
        });
    });
};

// PUT /api/escrows/:id/milestones/:mid/request-changes
export const requestMilestoneChanges = (req, res) => {
    const { id: escrowId, mid } = req.params;
    const { note } = req.body;

    if (!note) return res.status(400).json({ error: "note is required." });

    fetchEscrow(escrowId, (err, escrow) => {
        if (err) return res.status(500).json(err);
        if (!escrow) return res.status(404).json({ error: "Escrow not found." });
        if (escrow.localId !== req.user.id) return res.status(403).json({ error: "Forbidden." });

        db.query("SELECT * FROM milestones WHERE id = ? AND escrowId = ?", [mid, escrowId], (err, data) => {
            if (err) return res.status(500).json(err);
            if (!data || data.length === 0) return res.status(404).json({ error: "Milestone not found." });

            if (data[0].status !== "submitted") {
                return res.status(409).json({ error: "Only submitted milestones can have changes requested." });
            }

            const ts = now();

            db.query("UPDATE milestones SET status = 'revision_requested', updatedAt = ? WHERE id = ?", [ts, mid], (err) => {
                if (err) return res.status(500).json(err);

                db.query("UPDATE escrows SET status = 'active', activeAt = ? WHERE id = ?", [ts, escrowId], (err) => {
                    if (err) return res.status(500).json(err);
                    logEvent(db, { escrowId: parseInt(escrowId), milestoneId: parseInt(mid), actorId: req.user.id, actorRole: req.user.account_type, eventType: "change_requested", note });
                    sendNotification(escrow.studentId, req.user.id, "change_requested", parseInt(escrowId));
                    return res.status(200).json("Changes requested.");
                });
            });
        });
    });
};
