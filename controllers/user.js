import { db } from "../connect.js";
import { canOpenProfile, isAdmin } from "../services/studentPrivacy.js";
import {
  emptyProviderProfile,
  providerDisplayNameSql,
  providerTypeLabelSql,
  validateProviderProfile,
} from "../services/providerIdentity.js";

const userColumns = `u.id, u.username, u.email, u.name, u.city, u.language, u.profilePic,
  u.coverPic, u.instagram, u.twitter, u.facebook, u.website, u.account_type, u.is_admin,
  u.business_type, u.bio, u.skills, u.university, u.major, u.grad_year, u.phone,
  u.serviceCategoryId, u.provider_type, u.contact_person_name, u.company_name,
  u.organization_name, u.provider_profile_complete AS providerProfileComplete,
  ${providerDisplayNameSql("u")} AS providerDisplayName,
  ${providerTypeLabelSql("u")} AS providerTypeLabel`;

const relationshipUserColumns = `users.id, ${providerDisplayNameSql("users")} AS username, users.name, users.profilePic,
  users.account_type, users.provider_type, ${providerTypeLabelSql("users")} AS providerTypeLabel,
  users.bio, users.skills, users.university, users.major, users.grad_year`;

const discoveryDto = (user) => ({
  id: user.id,
  username: user.username,
  name: user.name,
  city: user.city,
  profilePic: user.profilePic,
  account_type: user.account_type,
  is_admin: Boolean(user.is_admin),
  business_type: user.business_type,
  provider_type: user.provider_type,
  providerDisplayName: user.providerDisplayName,
  providerTypeLabel: user.providerTypeLabel,
  providerProfileComplete: Boolean(user.providerProfileComplete),
  bio: user.bio,
  skills: user.skills,
  university: user.university,
  major: user.major,
  grad_year: user.grad_year,
  serviceCategoryId: user.serviceCategoryId,
  reviewCount: user.reviewCount,
  averageRating: user.averageRating,
});

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
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) {
    return res.status(400).json({ code: "invalid_id" });
  }
  if (!canOpenProfile(req.user, userId)) {
    return res.status(403).json({ code: "profile_private" });
  }
  const q = `SELECT ${userColumns}, reviews.reviewCount, reviews.averageRating
      FROM users u
      LEFT JOIN (
        SELECT revieweeId, COUNT(*) AS reviewCount, ROUND(AVG(rating), 1) AS averageRating
        FROM project_reviews
        GROUP BY revieweeId
      ) reviews ON reviews.revieweeId = u.id
      WHERE u.id = ?`;

  db.query(q, [userId], (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    if (!data || data.length === 0)
      return res.status(404).json({ code: "user_not_found" });
    const info = data[0];
    attachServiceCategories([info], (categoriesErr, users) => {
      if (categoriesErr)
        return res.status(500).json({ code: "request_failed" });
      return res.json(users[0]);
    });
  });
};

export const getAllUsers = (req, res) => {
  const { type } = req.query;
  const allowed = ["student", "local", "admin"];

  const anonymous = !req.user;
  const isStudentViewer =
    req.user?.account_type === "student" && !isAdmin(req.user);
  const q = `SELECT ${userColumns}, reviews.reviewCount, reviews.averageRating
      FROM users u
      LEFT JOIN (
        SELECT revieweeId, COUNT(*) AS reviewCount, ROUND(AVG(rating), 1) AS averageRating
        FROM project_reviews
        GROUP BY revieweeId
      ) reviews ON reviews.revieweeId = u.id
      ${type && allowed.includes(type) ? "WHERE u.account_type = ?" : "WHERE 1 = 1"}
      ${anonymous ? "AND u.account_type <> 'student'" : isStudentViewer ? "AND (u.account_type <> 'student' OR u.id = ?)" : ""}`;
  const params = type && allowed.includes(type) ? [type] : [];
  if (isStudentViewer) params.push(req.user.id);

  db.query(q, params, (err, data) => {
    if (err) {
      console.error("Error fetching users:");
      return res.status(500).json({ error: "Internal Server Error" });
    }
    const visibleUsers = data.map(discoveryDto);
    attachServiceCategories(visibleUsers, (categoriesErr, users) => {
      if (categoriesErr)
        return res.status(500).json({ code: "request_failed" });
      return res.json(users);
    });
  });
};

export const getFollowers = (req, res) => {
  const q = `SELECT ${relationshipUserColumns} FROM users
               JOIN relationships ON users.id = relationships.followerUserId
               WHERE relationships.followedUserId = ?
               ${req.user.account_type === "student" && !isAdmin(req.user) ? "AND (users.account_type <> 'student' OR users.id = ?)" : ""}`;

  const params = [req.user.id];
  if (req.user.account_type === "student" && !isAdmin(req.user))
    params.push(req.user.id);
  db.query(q, params, (err, data) => {
    if (err) {
      console.error("Error fetching users:");
      return res.status(500).json({ error: "Internal Server Error" });
    }
    return res.json(data);
  });
};

export const getFollowing = (req, res) => {
  const q = `SELECT ${relationshipUserColumns} FROM users
      JOIN relationships ON users.id = relationships.followedUserId
      WHERE relationships.followerUserId = ?
      ${req.user.account_type === "student" && !isAdmin(req.user) ? "AND (users.account_type <> 'student' OR users.id = ?)" : ""}`;

  const params = [req.user.id];
  if (req.user.account_type === "student" && !isAdmin(req.user))
    params.push(req.user.id);
  db.query(q, params, (err, data) => {
    if (err) {
      console.error("Error fetching users:");
      return res.status(500).json({ error: "Internal Server Error" });
    }
    return res.json(data);
  });
};

export const updateUser = (req, res) => {
  const providerResult =
    req.user.account_type === "local"
      ? validateProviderProfile(req.body)
      : { value: emptyProviderProfile };
  if (providerResult.error) return res.status(400).json(providerResult.error);
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
      "UPDATE users SET `name`=?,`city`=?,`language`=?,`profilePic`=?,`coverPic`=?,`instagram`=?,`twitter`=?,`facebook`=?,`website`=?,`business_type`=?,`bio`=?,`skills`=?,`university`=?,`major`=?,`grad_year`=?,`phone`=?,`provider_type`=?,`contact_person_name`=?,`company_name`=?,`organization_name`=?,`provider_profile_complete`=? WHERE id=?";

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
        req.body.business_type,
        req.body.bio,
        req.body.skills ?? null,
        req.body.university ?? null,
        req.body.major ?? null,
        req.body.grad_year ?? null,
        req.body.phone ?? null,
        providerResult.value.provider_type,
        providerResult.value.contact_person_name,
        providerResult.value.company_name,
        providerResult.value.organization_name,
        providerResult.value.provider_profile_complete,
        req.user.id,
      ],
      (err, data) => {
        if (err) return res.status(500).json({ code: "request_failed" });
        if (data.affectedRows === 0)
          return res.status(403).json("You can update only your profile!");
        if (!hasServiceCategories) return res.json("Updated!");

        db.query(
          "DELETE FROM student_service_categories WHERE userId = ?",
          [req.user.id],
          (deleteErr) => {
            if (deleteErr)
              return res.status(500).json({ code: "request_failed" });
            if (serviceCategoryIds.length === 0) return res.json("Updated!");

            const values = serviceCategoryIds.map((categoryId) => [
              req.user.id,
              categoryId,
            ]);
            db.query(
              "INSERT INTO student_service_categories (`userId`, `categoryId`) VALUES ?",
              [values],
              (insertErr) => {
                if (insertErr)
                  return res.status(500).json({ code: "request_failed" });
                return res.json("Updated!");
              },
            );
          },
        );
      },
    );
  };

  if (!hasServiceCategories || serviceCategoryIds.length === 0) return update();

  db.query(
    "SELECT id FROM categories WHERE id IN (?)",
    [serviceCategoryIds],
    (err, categories) => {
      if (err) return res.status(500).json({ code: "request_failed" });
      if (categories.length !== serviceCategoryIds.length)
        return res.status(400).json("Invalid service categories.");
      update();
    },
  );
};
