import {db} from "../connect.js";

const attachServiceCategories = (users, callback) => {
    const studentIds = users
      .filter((user) => user.account_type === "student")
      .map((user) => user.id);

    for (const user of users) user.serviceCategories = [];
    if (studentIds.length === 0) return callback(null, users);

    const q = `
      SELECT ssc.userId, c.id, c.slug, c.name
      FROM student_service_categories AS ssc
      JOIN categories AS c ON c.id = ssc.categoryId
      WHERE ssc.userId IN (?)
      ORDER BY c.sortOrder
    `;
    db.query(q, [studentIds], (err, rows) => {
      if (err) return callback(err);
      const usersById = new Map(users.map((user) => [user.id, user]));
      for (const row of rows) {
        usersById.get(row.userId)?.serviceCategories.push({
          id: row.id,
          slug: row.slug,
          name: row.name,
        });
      }
      return callback(null, users);
    });
};

export const getUser = (req, res) => {
    const userId = req.params.userId;
    const q = `SELECT u.*, reviews.reviewCount, reviews.averageRating
      FROM users u
      LEFT JOIN (
        SELECT revieweeId, COUNT(*) AS reviewCount, ROUND(AVG(rating), 1) AS averageRating
        FROM project_reviews
        GROUP BY revieweeId
      ) reviews ON reviews.revieweeId = u.id
      WHERE u.id = ?`;

    db.query(q, [userId], (err, data) => {
      if (err) return res.status(500).json(err);
      if (!data || data.length === 0) return res.status(500).json("Password undefined");
      const { password, ...info } = data[0];
      attachServiceCategories([info], (categoriesErr, users) => {
        if (categoriesErr) return res.status(500).json(categoriesErr);
        return res.json(users[0]);
      });
    });
};

export const getAllUsers = (req, res) => {
    const { type } = req.query;
    const allowed = ["student", "local", "admin"];

    const q = `SELECT u.*, reviews.reviewCount, reviews.averageRating
      FROM users u
      LEFT JOIN (
        SELECT revieweeId, COUNT(*) AS reviewCount, ROUND(AVG(rating), 1) AS averageRating
        FROM project_reviews
        GROUP BY revieweeId
      ) reviews ON reviews.revieweeId = u.id
      ${type && allowed.includes(type) ? "WHERE u.account_type = ?" : ""}`;
    const params = type && allowed.includes(type) ? [type] : [];

    db.query(q, params, (err, data) => {
      if (err) {
        console.error("Error fetching users:", err);
        return res.status(500).json({ error: "Internal Server Error" });
      }
      const usersWithoutPassword = data.map(({ password, ...u }) => u);
      attachServiceCategories(usersWithoutPassword, (categoriesErr, users) => {
        if (categoriesErr) return res.status(500).json(categoriesErr);
        return res.json(users);
      });
    });
};

export const getFollowers = (req, res) => {
    const q = `SELECT users.* FROM users
               JOIN relationships ON users.id = relationships.followerUserId
               WHERE relationships.followedUserId = ?`;

    db.query(q, [req.user.id], (err, data) => {
      if (err) {
        console.error("Error fetching users:", err);
        return res.status(500).json({ error: "Internal Server Error" });
      }
      const usersWithoutPassword = data.map((user) => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      return res.json(usersWithoutPassword);
    });
}

export const getFollowing = (req, res) => {
    const q = "SELECT users.* FROM users JOIN relationships ON users.id = relationships.followedUserId WHERE relationships.followerUserId = ?";

    db.query(q, [req.user.id], (err, data) => {
      if (err) {
        console.error("Error fetching users:", err);
        return res.status(500).json({ error: "Internal Server Error" });
      }
      const usersWithoutPassword = data.map((user) => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      return res.json(usersWithoutPassword);
    });
}

export const updateUser = (req, res) => {
    const hasServiceCategories = req.body.serviceCategoryIds !== undefined;
    if (hasServiceCategories && !Array.isArray(req.body.serviceCategoryIds)) {
      return res.status(400).json("Invalid service categories.");
    }
    const serviceCategoryIds = hasServiceCategories
      ? [...new Set(req.body.serviceCategoryIds.map(Number))]
      : [];

    if (serviceCategoryIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      return res.status(400).json("Invalid service categories.");
    }
    if (hasServiceCategories && req.user.account_type !== "student") {
      return res.status(403).json("Only students can select services.");
    }

    const update = () => {
      const q =
        "UPDATE users SET `name`=?,`city`=?,`language`=?,`profilePic`=?,`coverPic`=?,`instagram`=?,`twitter`=?,`facebook`=?,`website`=?,`account_type`=?,`business_type`=?,`bio`=?,`skills`=?,`university`=?,`major`=?,`grad_year`=?,`phone`=? WHERE id=?";

      db.query(
        q,
        [
          req.body.name,
          req.body.city,
          req.body.language,
          req.body.profilePic,
          req.body.coverPic,
          req.body.instagram,
          req.body.twitter,
          req.body.facebook,
          req.body.website,
          req.body.account_type,
          req.body.business_type,
          req.body.bio,
          req.body.skills ?? null,
          req.body.university ?? null,
          req.body.major ?? null,
          req.body.grad_year ?? null,
          req.body.phone ?? null,
          req.user.id,
        ],
        (err, data) => {
          if (err) return res.status(500).json(err);
          if (data.affectedRows === 0) return res.status(403).json("You can update only your profile!");
          if (!hasServiceCategories) return res.json("Updated!");

          db.query("DELETE FROM student_service_categories WHERE userId = ?", [req.user.id], (deleteErr) => {
            if (deleteErr) return res.status(500).json(deleteErr);
            if (serviceCategoryIds.length === 0) return res.json("Updated!");

            const values = serviceCategoryIds.map((categoryId) => [req.user.id, categoryId]);
            db.query("INSERT INTO student_service_categories (`userId`, `categoryId`) VALUES ?", [values], (insertErr) => {
              if (insertErr) return res.status(500).json(insertErr);
              return res.json("Updated!");
            });
          });
        }
      );
    };

    if (!hasServiceCategories || serviceCategoryIds.length === 0) return update();

    db.query("SELECT id FROM categories WHERE id IN (?)", [serviceCategoryIds], (err, categories) => {
      if (err) return res.status(500).json(err);
      if (categories.length !== serviceCategoryIds.length) return res.status(400).json("Invalid service categories.");
      update();
    });
};
