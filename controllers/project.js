import { db } from "../connect.js";
import moment from "moment";

export const getProjects = (req, res) => {
    const { category, subcategory } = req.query;

    const params = [];
    let joinClause = "";
    let whereClause = "WHERE p.status IN ('open', 'in_escrow', 'closed')";

    if (subcategory) {
        joinClause = `
            JOIN project_categories AS pc ON (pc.projectId = p.id)
            JOIN subcategories AS sc ON (sc.id = pc.subcategoryId)
        `;
        whereClause += " AND sc.slug = ?";
        params.push(subcategory);
    } else if (category) {
        joinClause = "";
        whereClause += " AND cat.slug = ?";
        params.push(category);
    }

    const q = `
        SELECT DISTINCT p.*, u.id AS userId, username, profilePic, reviews.reviewCount, reviews.averageRating, cat.slug AS categorySlug, cat.name AS categoryName,
            (
                SELECT GROUP_CONCAT(sc2.slug SEPARATOR ',')
                FROM project_categories AS pc2
                JOIN subcategories AS sc2 ON (sc2.id = pc2.subcategoryId)
                WHERE pc2.projectId = p.id
            ) AS subcategorySlugs
        FROM projects AS p
        JOIN users AS u ON (u.id = p.userId)
        LEFT JOIN (
            SELECT revieweeId, COUNT(*) AS reviewCount, ROUND(AVG(rating), 1) AS averageRating
            FROM project_reviews
            GROUP BY revieweeId
        ) reviews ON reviews.revieweeId = u.id
        LEFT JOIN categories AS cat ON (cat.id = p.categoryId)
        ${joinClause}
        ${whereClause}
        ORDER BY FIELD(p.status, 'open', 'in_escrow', 'closed'), p.createdAt DESC
    `;
    db.query(q, params, (err, data) => {
        if (err) return res.status(500).json(err);
        return res.status(200).json(data);
    });
};

export const getProjectsByLocal = (req, res) => {
    const q = `
        SELECT p.*, u.id AS userId, username, profilePic, reviews.reviewCount, reviews.averageRating, cat.slug AS categorySlug, cat.name AS categoryName
        FROM projects AS p
        JOIN users AS u ON (u.id = p.userId)
        LEFT JOIN (
            SELECT revieweeId, COUNT(*) AS reviewCount, ROUND(AVG(rating), 1) AS averageRating
            FROM project_reviews
            GROUP BY revieweeId
        ) reviews ON reviews.revieweeId = u.id
        LEFT JOIN categories AS cat ON (cat.id = p.categoryId)
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
        SELECT p.*, u.id AS userId, username, profilePic, reviews.reviewCount, reviews.averageRating, cat.slug AS categorySlug, cat.name AS categoryName,
            (
                SELECT GROUP_CONCAT(sc.slug SEPARATOR ',')
                FROM project_categories AS pc
                JOIN subcategories AS sc ON (sc.id = pc.subcategoryId)
                WHERE pc.projectId = p.id
            ) AS subcategorySlugs
        FROM projects AS p
        JOIN users AS u ON (u.id = p.userId)
        LEFT JOIN (
            SELECT revieweeId, COUNT(*) AS reviewCount, ROUND(AVG(rating), 1) AS averageRating
            FROM project_reviews
            GROUP BY revieweeId
        ) reviews ON reviews.revieweeId = u.id
        LEFT JOIN categories AS cat ON (cat.id = p.categoryId)
        WHERE p.id = ?
    `;
    db.query(q, [req.params.id], (err, data) => {
        if (err) return res.status(500).json(err);
        if (!data || data.length === 0) return res.status(404).json({ error: "Project not found." });
        return res.status(200).json(data[0]);
    });
};

export const createProject = (req, res) => {
    const categoryId = Number(req.body.categoryId);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return res.status(400).json({ error: "A valid project category is required." });
    }

    db.query("SELECT id FROM categories WHERE id = ?", [categoryId], (categoryErr, categories) => {
        if (categoryErr) return res.status(500).json(categoryErr);
        if (categories.length === 0) return res.status(400).json({ error: "A valid project category is required." });

    const q = "INSERT INTO projects(`userId`, `title`, `description`, `skills`, `timeline`, `deliverables`, `status`, `createdAt`, `categoryId`) VALUES (?)";
    const values = [
        req.user.id,
        req.body.title,
        req.body.description,
        req.body.skills ?? null,
        req.body.timeline ?? null,
        req.body.deliverables ?? null,
        'open',
        moment(Date.now()).format("YYYY-MM-DD HH:mm:ss"),
        categoryId,
    ];
    db.query(q, [values], (err, data) => {
        if (err) return res.status(500).json(err);
        const projectId = data.insertId;

        const subcategoryIds = Array.isArray(req.body.subcategoryIds) ? req.body.subcategoryIds : [];
        if (subcategoryIds.length === 0) return res.status(200).json({ id: projectId });

        const tagQ = "INSERT INTO project_categories (`projectId`, `subcategoryId`) VALUES ?";
        const tagValues = subcategoryIds.map((subcategoryId) => [projectId, subcategoryId]);
        db.query(tagQ, [tagValues], (err) => {
            if (err) return res.status(500).json(err);
            return res.status(200).json({ id: projectId });
        });
    });
    });
};

export const updateProject = (req, res) => {
    const categoryId = Number(req.body.categoryId);
    const title = req.body.title?.trim();
    const description = req.body.description?.trim();

    if (!title || !description || !Number.isInteger(categoryId) || categoryId <= 0) {
        return res.status(400).json({ error: "A title, description, and valid project category are required." });
    }

    db.query("SELECT userId FROM projects WHERE id = ?", [req.params.id], (err, data) => {
        if (err) return res.status(500).json(err);
        if (!data || data.length === 0) return res.status(404).json({ error: "Project not found." });
        if (data[0].userId !== req.user.id) return res.status(403).json({ error: "You can only edit your own projects." });

        db.query("SELECT id FROM categories WHERE id = ?", [categoryId], (categoryErr, categories) => {
            if (categoryErr) return res.status(500).json(categoryErr);
            if (categories.length === 0) return res.status(400).json({ error: "A valid project category is required." });

            const q = "UPDATE projects SET `title`=?, `description`=?, `skills`=?, `timeline`=?, `deliverables`=?, `categoryId`=? WHERE id=?";
            db.query(
                q,
                [
                    title,
                    description,
                    req.body.skills ?? null,
                    req.body.timeline ?? null,
                    req.body.deliverables ?? null,
                    categoryId,
                    req.params.id,
                ],
                (updateErr, updated) => {
                    if (updateErr) return res.status(500).json(updateErr);
                    if (updated.affectedRows === 0) return res.status(500).json({ error: "Update failed." });

                    if (!Array.isArray(req.body.subcategoryIds)) return res.status(200).json("Updated!");

                    db.query("DELETE FROM project_categories WHERE projectId = ?", [req.params.id], (deleteErr) => {
                        if (deleteErr) return res.status(500).json(deleteErr);
                        if (req.body.subcategoryIds.length === 0) return res.status(200).json("Updated!");

                        const tagQ = "INSERT INTO project_categories (`projectId`, `subcategoryId`) VALUES ?";
                        const tagValues = req.body.subcategoryIds.map((subcategoryId) => [req.params.id, subcategoryId]);
                        db.query(tagQ, [tagValues], (insertErr) => {
                            if (insertErr) return res.status(500).json(insertErr);
                            return res.status(200).json("Updated!");
                        });
                    });
                }
            );
        });
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
