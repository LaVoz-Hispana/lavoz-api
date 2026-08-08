import { db } from "../connect.js";
import moment from "moment";
import { logEvent } from "../utils/escrowLogger.js";
import { sendNotification } from "../utils/notificationHelper.js";

const now = () => moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");

// POST /api/escrows/:id/milestones/:mid/submit
export const submitArtifact = (req, res) => {
    const escrowId   = req.params.id;
    const milestoneId = req.params.mid;
    const { fileUrl, description } = req.body;

    if (!fileUrl && !description) return res.status(400).json({ error: "fileUrl or description is required." });

    db.query("SELECT * FROM escrows WHERE id = ?", [escrowId], (err, data) => {
        if (err) return res.status(500).json(err);
        if (!data || data.length === 0) return res.status(404).json({ error: "Escrow not found." });

        const escrow = data[0];

        if (escrow.studentId !== req.user.id) return res.status(403).json({ error: "Forbidden." });
        if (!["active", "pending"].includes(escrow.status)) {
            return res.status(409).json({ error: "Artifacts can only be submitted on active escrows." });
        }

        // Validate milestone belongs to this escrow and is in a submittable state
        db.query("SELECT * FROM milestones WHERE id = ? AND escrowId = ?", [milestoneId, escrowId], (err, mData) => {
            if (err) return res.status(500).json(err);
            if (!mData || mData.length === 0) return res.status(404).json({ error: "Milestone not found." });

            const milestone = mData[0];
            if (!["pending", "active", "revision_requested"].includes(milestone.status)) {
                return res.status(409).json({ error: "This milestone cannot accept a new submission." });
            }

            const ts = now();

            const artifactQ = "INSERT INTO artifacts(`escrowId`, `milestoneId`, `studentId`, `fileUrl`, `description`, `createdAt`) VALUES (?)";
            const artifactValues = [escrowId, milestoneId, req.user.id, fileUrl ?? null, description ?? null, ts];

            db.query(artifactQ, [artifactValues], (err, artifactData) => {
                if (err) return res.status(500).json(err);

                // Advance milestone to submitted
                db.query(
                    "UPDATE milestones SET status = 'submitted', updatedAt = ? WHERE id = ?",
                    [ts, milestoneId],
                    (err) => {
                        if (err) return res.status(500).json(err);

                        // Keep escrow-level submittedAt for backward compat
                        db.query(
                            "UPDATE escrows SET status = 'submitted', submittedAt = ? WHERE id = ?",
                            [ts, escrowId],
                            (err) => {
                                if (err) return res.status(500).json(err);
                                logEvent(db, {
                                    escrowId:    parseInt(escrowId),
                                    milestoneId: parseInt(milestoneId),
                                    artifactId:  artifactData.insertId,
                                    actorId:     req.user.id,
                                    actorRole:   req.user.account_type,
                                    eventType:   "artifact_submitted",
                                });
                                sendNotification(escrow.localId, req.user.id, "artifact_submitted", parseInt(escrowId));
                                return res.status(201).json({ id: artifactData.insertId });
                            }
                        );
                    }
                );
            });
        });
    });
};

// GET /api/artifacts/:escrowId
// Returns artifacts grouped by milestoneId. Only participants and admins may view.
export const getArtifactsByEscrow = (req, res) => {
    const escrowId = req.params.escrowId;

    db.query("SELECT studentId, localId FROM escrows WHERE id = ?", [escrowId], (err, data) => {
        if (err) return res.status(500).json(err);
        if (!data || data.length === 0) return res.status(404).json({ error: "Escrow not found." });

        const escrow = data[0];
        const uid = req.user.id;
        const isParticipant = escrow.studentId === uid || escrow.localId === uid;

        if (!req.user.is_admin && !isParticipant) {
            return res.status(403).json({ error: "Forbidden." });
        }

        const q = `
            SELECT a.*, u.username, u.profilePic
            FROM artifacts AS a
            JOIN users AS u ON (u.id = a.studentId)
            WHERE a.escrowId = ?
            ORDER BY a.createdAt DESC
        `;
        db.query(q, [escrowId], (err, artifacts) => {
            if (err) return res.status(500).json(err);

            // Group by milestoneId; key is the id as a string, or "unlinked" for legacy rows
            const grouped = {};
            for (const artifact of artifacts) {
                const key = artifact.milestoneId != null ? String(artifact.milestoneId) : "unlinked";
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(artifact);
            }

            return res.status(200).json(grouped);
        });
    });
};

// DELETE /api/artifacts/:id
// Student (owner) may delete only while the escrow is still active.
export const deleteArtifact = (req, res) => {
    db.query(
        "SELECT a.*, e.status AS escrowStatus FROM artifacts AS a JOIN escrows AS e ON (e.id = a.escrowId) WHERE a.id = ?",
        [req.params.id],
        (err, data) => {
            if (err) return res.status(500).json(err);
            if (!data || data.length === 0) return res.status(404).json({ error: "Artifact not found." });

            const artifact = data[0];

            if (artifact.studentId !== req.user.id) return res.status(403).json({ error: "Forbidden." });
            if (artifact.escrowStatus !== "active") return res.status(409).json({ error: "Artifacts can only be deleted while the escrow is active." });

            db.query("DELETE FROM artifacts WHERE id = ?", [req.params.id], (err) => {
                if (err) return res.status(500).json(err);
                return res.status(200).json("Artifact deleted.");
            });
        }
    );
};
