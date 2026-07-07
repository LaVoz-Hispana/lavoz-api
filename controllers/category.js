import { db } from "../connect.js";

export const getCategories = (req, res) => {
    const q = `
        SELECT c.id AS categoryId, c.slug AS categorySlug, c.name AS categoryName,
               s.id AS subcategoryId, s.slug AS subcategorySlug, s.name AS subcategoryName
        FROM categories AS c
        LEFT JOIN subcategories AS s ON (s.categoryId = c.id)
        ORDER BY c.sortOrder, s.sortOrder
    `;
    db.query(q, (err, rows) => {
        if (err) return res.status(500).json(err);

        const categories = [];
        const byId = new Map();

        for (const row of rows) {
            let category = byId.get(row.categoryId);
            if (!category) {
                category = {
                    id: row.categoryId,
                    slug: row.categorySlug,
                    name: row.categoryName,
                    subcategories: [],
                };
                byId.set(row.categoryId, category);
                categories.push(category);
            }
            if (row.subcategoryId) {
                category.subcategories.push({
                    id: row.subcategoryId,
                    slug: row.subcategorySlug,
                    name: row.subcategoryName,
                });
            }
        }

        return res.status(200).json(categories);
    });
};
