import { db } from "../connect.js";

export const getServices = (req, res) => {
    const { category, subcategory } = req.query;

    const params = [];
    let joinClause = "";
    let whereClause = "";

    if (subcategory) {
        joinClause = `
            JOIN service_categories AS sc1 ON (sc1.serviceId = s.id)
            JOIN subcategories AS sub ON (sub.id = sc1.subcategoryId)
        `;
        whereClause = "WHERE sub.slug = ?";
        params.push(subcategory);
    } else if (category) {
        joinClause = "";
        whereClause = "WHERE cat.slug = ?";
        params.push(category);
    }

    const q = `
        SELECT DISTINCT s.id, s.userId, u.username, u.profilePic, u.university,
               s.title, s.description, s.skills, s.availability, s.createdAt,
               cat.slug AS categorySlug, cat.name AS categoryName,
               (
                   SELECT GROUP_CONCAT(sub2.slug SEPARATOR ',')
                   FROM service_categories AS sc2
                   JOIN subcategories AS sub2 ON (sub2.id = sc2.subcategoryId)
                   WHERE sc2.serviceId = s.id
               ) AS subcategorySlugs
        FROM services AS s
        JOIN users AS u ON (u.id = s.userId)
        LEFT JOIN categories AS cat ON (cat.id = s.categoryId)
        ${joinClause}
        ${whereClause}
        ORDER BY s.createdAt DESC
    `;
    db.query(q, params, (err, data) => {
        if (err) return res.status(500).json(err);
        return res.status(200).json(data);
    });
};

export const createService = (req, res) => {
    const categoryId = Number(req.body.categoryId);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return res.status(400).json({ error: "A valid service category is required." });
    }

    db.query(
        "SELECT categoryId FROM student_service_categories WHERE userId = ? AND categoryId = ?",
        [req.user.id, categoryId],
        (categoryErr, categories) => {
            if (categoryErr) return res.status(500).json(categoryErr);
            if (categories.length === 0) return res.status(403).json({ error: "Choose a category from your selected services." });

            const q = "INSERT INTO services(`userId`, `title`, `description`, `skills`, `availability`, `categoryId`) VALUES (?)";
            const values = [
                req.user.id,
                req.body.title,
                req.body.description,
                req.body.skills ?? null,
                req.body.availability ?? null,
                categoryId,
            ];
            db.query(q, [values], (err, data) => {
        if (err) return res.status(500).json(err);
        const serviceId = data.insertId;

        const subcategoryIds = Array.isArray(req.body.subcategoryIds) ? req.body.subcategoryIds : [];
        if (subcategoryIds.length === 0) return res.status(201).json({ id: serviceId });

        const tagQ = "INSERT INTO service_categories (`serviceId`, `subcategoryId`) VALUES ?";
        const tagValues = subcategoryIds.map((subcategoryId) => [serviceId, subcategoryId]);
        db.query(tagQ, [tagValues], (err) => {
            if (err) return res.status(500).json(err);
            return res.status(201).json({ id: serviceId });
        });
            });
        }
    );
};

export const deleteService = (req, res) => {
    // Owner or admin may delete
    db.query("SELECT userId FROM services WHERE id = ?", [req.params.id], (err, data) => {
        if (err) return res.status(500).json(err);
        if (!data || data.length === 0) return res.status(404).json({ error: "Service not found." });

        const isOwner = data[0].userId === req.user.id;
        const isAdmin = req.user.account_type === "admin";

        if (!isOwner && !isAdmin) return res.status(403).json({ error: "Not allowed." });

        db.query("DELETE FROM services WHERE id = ?", [req.params.id], (err) => {
            if (err) return res.status(500).json(err);
            return res.status(200).json("Service deleted.");
        });
    });
};
