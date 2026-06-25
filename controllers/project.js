import { db } from "../connect.js";
import moment from "moment";

export const getProjects = (req, res) => {
    const q = `
        SELECT p.*, u.id AS userId, username, profilePic
        FROM projects AS p
        JOIN users AS u ON (u.id = p.userId)
        WHERE p.status IN ('open', 'in_escrow', 'closed')
        ORDER BY FIELD(p.status, 'open', 'in_escrow', 'closed'), p.createdAt DESC
    `;
    db.query(q, (err, data) => {
        if (err) return res.status(500).json(err);
        return res.status(200).json(data);
    });
};

export const getProjectsByLocal = (req, res) => {
    const q = `
        SELECT p.*, u.id AS userId, username, profilePic
        FROM projects AS p
        JOIN users AS u ON (u.id = p.userId)
        WHERE p.userId = ?
        ORDER BY p.createdAt DESC
    `;
    db.query(q, [req.user.id], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.status(200).json(data);
    });
};

export const getProjectById = (req, res) => {
    const q = `
        SELECT p.*, u.id AS userId, username, profilePic
        FROM projects AS p
        JOIN users AS u ON (u.id = p.userId)
        WHERE p.id = ?
    `;
    db.query(q, [req.params.id], (err, data) => {
        if (err) return res.status(500).json(err);
        if (!data || data.length === 0) return res.status(404).json({ error: "Project not found." });
        return res.status(200).json(data[0]);
    });
};

export const createProject = (req, res) => {
    const q = "INSERT INTO projects(`userId`, `title`, `description`, `skills`, `timeline`, `deliverables`, `status`, `createdAt`) VALUES (?)";
    const values = [
        req.user.id,
        req.body.title,
        req.body.description,
        req.body.skills ?? null,
        req.body.timeline ?? null,
        req.body.deliverables ?? null,
        'open',
        moment(Date.now()).format("YYYY-MM-DD HH:mm:ss"),
    ];
    db.query(q, [values], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.status(200).json({ id: data.insertId });
    });
};

export const updateProject = (req, res) => {
    // Verify ownership before updating
    db.query("SELECT userId FROM projects WHERE id = ?", [req.params.id], (err, data) => {
        if (err) return res.status(500).json(err);
        if (!data || data.length === 0) return res.status(404).json({ error: "Project not found." });
        if (data[0].userId !== req.user.id) return res.status(403).json({ error: "You can only edit your own projects." });

        const q = "UPDATE projects SET `title`=?, `description`=?, `skills`=?, `timeline`=?, `deliverables`=?, `status`=? WHERE id=?";
        db.query(
            q,
            [
                req.body.title,
                req.body.description,
                req.body.skills ?? null,
                req.body.timeline ?? null,
                req.body.deliverables ?? null,
                req.body.status,
                req.params.id,
            ],
            (err, data) => {
                if (err) return res.status(500).json(err);
                if (data.affectedRows > 0) return res.status(200).json("Updated!");
                return res.status(500).json({ error: "Update failed." });
            }
        );
    });
};

export const deleteProject = (req, res) => {
    // Verify ownership and ensure no active escrow is linked before deleting
    db.query("SELECT userId FROM projects WHERE id = ?", [req.params.id], (err, data) => {
        if (err) return res.status(500).json(err);
        if (!data || data.length === 0) return res.status(404).json({ error: "Project not found." });
        if (data[0].userId !== req.user.id) return res.status(403).json({ error: "You can only delete your own projects." });

        db.query("SELECT id FROM escrows WHERE projectId = ? LIMIT 1", [req.params.id], (err, escrows) => {
            if (err) return res.status(500).json(err);
            if (escrows && escrows.length > 0) return res.status(409).json({ error: "Cannot delete a project that has a linked escrow." });

            db.query("DELETE FROM projects WHERE id = ?", [req.params.id], (err, data) => {
                if (err) return res.status(500).json(err);
                return res.status(200).json("Project deleted.");
            });
        });
    });
};
