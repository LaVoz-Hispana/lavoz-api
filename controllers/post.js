import { db } from "../connect.js";
import moment from "moment";
import {
  canOpenProfile,
  redactStudentIdentity,
  redactTaggedContent,
} from "../services/studentPrivacy.js";
import {
  providerDisplayNameSql,
  providerTypeLabelSql,
} from "../services/providerIdentity.js";

const authorIdentityColumns = `${providerDisplayNameSql("u")} AS username,
  ${providerTypeLabelSql("u")} AS providerTypeLabel, u.provider_type`;

const visibleContent = (rows, viewer) =>
  rows.map((row) => {
    const result = redactTaggedContent(row, viewer);
    return redactStudentIdentity(result, viewer);
  });

export const getTopPosts = (req, res) => {
  const q = `
      SELECT p.*, u.id AS userId, ${authorIdentityColumns}, profilePic, u.account_type AS authorAccountType, COUNT(l.userId) AS likeCount
      FROM posts AS p
      JOIN users AS u ON (u.id = p.userId)
      LEFT JOIN likes AS l ON (p.id = l.postId)
      WHERE p.createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY p.id
      HAVING likeCount > 0
      ORDER BY p.createdAt DESC
      LIMIT 5
    `;

  db.query(q, (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json(visibleContent(data, req.user));
  });
};

export const getLatestNews = (req, res) => {
  const q = `
      SELECT p.*, u.id AS userId, ${authorIdentityColumns}, profilePic, u.account_type AS authorAccountType
      FROM posts AS p
      JOIN users AS u ON (u.id = p.userId)
      WHERE p.createdAt >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
      AND (p.category = "news" OR p.category = "local" OR p.category = "latam" OR p.category = "usa" OR p.category = "global")
      ORDER BY p.createdAt DESC
    `;

  db.query(q, (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json(visibleContent(data, req.user));
  });
};

export const getPosts = (req, res) => {
  const requestedUserId = req.query.userId;
  const limit = 25;
  const hasTarget = requestedUserId && requestedUserId !== "undefined";
  const userId = hasTarget ? Number(requestedUserId) : null;
  if (hasTarget && (!Number.isSafeInteger(userId) || userId <= 0)) {
    return res.status(400).json({ code: "invalid_id" });
  }

  const loadPosts = () => {
    const where = hasTarget ? "WHERE p.userId = ?" : "";
    const q = `SELECT p.*, u.id AS userId, ${authorIdentityColumns}, profilePic, u.account_type AS authorAccountType,
      pr.title AS projectTitle, pr.description AS projectDescription,
      (SELECT GROUP_CONCAT(CONCAT(tu.id, '::', tu.username, '::', tu.account_type) SEPARATOR '||')
       FROM post_tags pt JOIN users tu ON tu.id = pt.userId WHERE pt.postId = p.id) AS taggedUsers
      FROM posts AS p
      JOIN users AS u ON u.id = p.userId
      LEFT JOIN projects AS pr ON pr.id = p.projectId
      ${where}
      ORDER BY p.createdAt DESC LIMIT ${limit}`;
    db.query(q, hasTarget ? [userId] : [], (err, data) => {
      if (err) return res.status(500).json({ code: "request_failed" });
      return res.status(200).json(visibleContent(data, req.user));
    });
  };

  if (!hasTarget) return loadPosts();
  if (!canOpenProfile(req.user, userId))
    return res.status(403).json({ code: "profile_private" });
  db.query(
    "SELECT id, account_type FROM users WHERE id = ?",
    [userId],
    (error, users) => {
      if (error) return res.status(500).json({ code: "request_failed" });
      if (!users?.length)
        return res.status(404).json({ code: "user_not_found" });
      if (
        users[0].account_type === "student" &&
        !canOpenProfile(req.user, userId)
      ) {
        return res.status(403).json({ code: "student_profile_private" });
      }
      return loadPosts();
    },
  );
};

export const getProjectPosts = (req, res) => {
  const { projectId } = req.params;
  const q = `
    SELECT p.*, u.id AS userId, ${authorIdentityColumns}, profilePic, u.account_type AS authorAccountType, pr.title AS projectTitle, pr.description AS projectDescription,
      (SELECT GROUP_CONCAT(CONCAT(tu.id, '::', tu.username, '::', tu.account_type) SEPARATOR '||') FROM post_tags pt JOIN users tu ON tu.id = pt.userId WHERE pt.postId = p.id) AS taggedUsers
    FROM posts AS p
    JOIN users AS u ON (u.id = p.userId)
    LEFT JOIN projects AS pr ON (pr.id = p.projectId)
    WHERE p.projectId = ?
    ORDER BY p.createdAt DESC
  `;
  db.query(q, [projectId], (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json(visibleContent(data, req.user));
  });
};

export const getAdminPosts = (req, res) => {
  const q = `
    SELECT p.*, u.id AS userId, ${authorIdentityColumns}, profilePic, u.account_type AS authorAccountType,
      (SELECT GROUP_CONCAT(CONCAT(tu.id, '::', tu.username, '::', tu.account_type) SEPARATOR '||')
       FROM post_tags pt JOIN users tu ON tu.id = pt.userId
       WHERE pt.postId = p.id) AS taggedUsers
    FROM posts AS p
    JOIN users AS u ON (u.id = p.userId)
    WHERE p.isAdminPost = TRUE
    ORDER BY p.createdAt DESC
  `;

  db.query(q, (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json(visibleContent(data, req.user));
  });
};

export const getShorts = (req, res) => {
  const q = `SELECT v.*, u.id AS userId, ${authorIdentityColumns}, profilePic, u.account_type AS authorAccountType FROM shorts AS v JOIN users AS u ON (u.id = v.userId)
  ORDER BY v.createdAt DESC LIMIT 30`;

  db.query(q, (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json(visibleContent(data, req.user));
  });
};

export const getEvents = (req, res) => {
  const q = `SELECT e.*, u.id AS userId, ${authorIdentityColumns}, profilePic, u.account_type AS authorAccountType FROM events AS e JOIN users AS u ON (u.id = e.userId)
     WHERE e.date >= DATE(NOW())
     ORDER BY e.date ASC`;

  db.query(q, (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json(visibleContent(data, req.user));
  });
};

export const getJobs = (req, res) => {
  const q = `SELECT j.*, u.id AS userId, ${authorIdentityColumns}, profilePic, u.account_type AS authorAccountType FROM jobs AS j JOIN users AS u ON (u.id = j.userId)
     ORDER BY j.createdAt DESC`;

  db.query(q, (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json(visibleContent(data, req.user));
  });
};

export const findPost = (req, res) => {
  const q = `SELECT p.*, u.id AS userId, ${authorIdentityColumns}, profilePic, u.account_type AS authorAccountType, pr.title AS projectTitle, pr.description AS projectDescription, (SELECT GROUP_CONCAT(CONCAT(tu.id, '::', tu.username, '::', tu.account_type) SEPARATOR '||') FROM post_tags pt JOIN users tu ON tu.id = pt.userId WHERE pt.postId = p.id) AS taggedUsers FROM posts AS p JOIN users AS u ON (u.id = p.userId) LEFT JOIN projects AS pr ON (pr.id = p.projectId) WHERE p.id = ?`;
  db.query(q, [req.query.id], (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json(visibleContent(data, req.user));
  });
};

export const addPost = (req, res) => {
  const isAdminPost = req.isAdminPost === true;
  const projectId = req.body.projectId ? Number(req.body.projectId) : null;
  const taggedUserIds = Array.isArray(req.body.taggedUserIds)
    ? [
        ...new Set(
          req.body.taggedUserIds
            .map(Number)
            .filter(
              (id) => Number.isInteger(id) && id > 0 && id !== req.user.id,
            ),
        ),
      ]
    : [];

  if (req.body.projectId && (!Number.isInteger(projectId) || projectId <= 0)) {
    return res
      .status(400)
      .json({ error: "A valid project reference is required." });
  }

  if (isAdminPost && (projectId || taggedUserIds.length > 0)) {
    return res.status(400).json({
      error: "Official posts cannot reference projects or tag collaborators.",
    });
  }

  const insertPost = () => {
    const q =
      "INSERT INTO posts(`desc`, `img0`, `img1`, `img2`, `img3`, `img4`, `img5`, `img6`, `img7`, `img8`, `img9`, `createdAt`, `userId`, `category`, `flag`, `article`, `url`, `projectId`, `postType`, `isAdminPost`) VALUES (?)";
    const values = [
      req.body.desc,
      req.body.img0,
      req.body.img1,
      req.body.img2,
      req.body.img3,
      req.body.img4,
      req.body.img5,
      req.body.img6,
      req.body.img7,
      req.body.img8,
      req.body.img9,
      moment(Date.now()).format("YYYY-MM-DD HH:mm:ss"),
      req.user.id,
      req.body.category,
      req.body.hasFlag,
      req.body.article,
      req.body.url,
      projectId,
      req.body.postType || null,
      isAdminPost,
    ];
    db.query(q, [values], (err, data) => {
      if (err) return res.status(500).json({ code: "request_failed" });
      if (taggedUserIds.length === 0)
        return res.status(200).json("Post has been created.");

      const tagValues = taggedUserIds.map((userId) => [data.insertId, userId]);
      db.query(
        "INSERT INTO post_tags (`postId`, `userId`) VALUES ?",
        [tagValues],
        (tagErr) => {
          if (tagErr) return res.status(500).json({ code: "request_failed" });
          return res.status(200).json("Post has been created.");
        },
      );
    });
  };

  if (!projectId) {
    if (taggedUserIds.length > 0)
      return res
        .status(400)
        .json({ error: "Tags require a project reference." });
    return insertPost();
  }

  const escrowQ = `
      SELECT DISTINCT CASE WHEN studentId = ? THEN localId ELSE studentId END AS collaboratorId
      FROM escrows
      WHERE projectId = ? AND (studentId = ? OR localId = ?)
    `;
  db.query(
    escrowQ,
    [req.user.id, projectId, req.user.id, req.user.id],
    (err, escrows) => {
      if (err) return res.status(500).json({ code: "request_failed" });
      if (!escrows || escrows.length === 0) {
        return res
          .status(403)
          .json({ error: "You can only reference projects in your escrows." });
      }
      const collaboratorIds = new Set(
        escrows.map((escrow) => escrow.collaboratorId),
      );
      if (taggedUserIds.some((userId) => !collaboratorIds.has(userId))) {
        return res.status(403).json({
          error: "You can only tag collaborators from this project escrow.",
        });
      }
      return insertPost();
    },
  );
};

export const addAdminPost = (req, res) => {
  req.isAdminPost = true;
  return addPost(req, res);
};

export const addShort = (req, res) => {
  const q =
    "INSERT INTO shorts(`desc`, `videoURL`, `createdAt`, `userId`) VALUES (?)";
  const values = [
    req.body.desc,
    req.body.imgUrl,
    moment(Date.now()).format("YYYY-MM-DD HH:mm:ss"),
    req.user.id,
  ];
  db.query(q, [values], (err) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json("Short has been created.");
  });
};

export const addEvent = (req, res) => {
  const dateTimeStr = `${req.body.date} ${req.body.time}`;
  const q =
    "INSERT INTO events(`name`, `location`, `date`, `description`, `file`, `url`, `userId`, `category`) VALUES (?)";
  const values = [
    req.body.name,
    req.body.location,
    moment(dateTimeStr).format("YYYY-MM-DD HH:mm:ss"),
    req.body.description,
    req.body.img,
    req.body.url,
    req.user.id,
    req.body.category,
  ];
  db.query(q, [values], (err) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json("Event has been created.");
  });
};

export const deleteEvent = (req, res) => {
  const q = "DELETE FROM events WHERE `id`=?";

  db.query(q, [req.params.id], (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    if (data.affectedRows > 0)
      return res.status(200).json("Post has been deleted.");
    return res.status(403).json("You can delete only your post");
  });
};

export const addJob = (req, res) => {
  const q =
    "INSERT INTO jobs(`name`, `category`, `pay`, `schedule`, `location`, `description`, `contact`, `userId`, `img`, `createdAt`, `url`) VALUES (?)";
  const values = [
    req.body.name,
    req.body.category,
    req.body.pay,
    req.body.schedule,
    req.body.location,
    req.body.description,
    req.body.contact,
    req.user.id,
    req.body.img,
    moment(Date.now()).format("YYYY-MM-DD HH:mm:ss"),
    req.body.url,
  ];

  db.query(q, [values], (err) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json("Job has been created.");
  });
};

export const deleteJob = (req, res) => {
  const q = "DELETE FROM jobs WHERE `id`=?";

  db.query(q, [req.params.id], (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    if (data.affectedRows > 0)
      return res.status(200).json("Post has been deleted.");
    return res.status(403).json("You can delete only your post");
  });
};

export const deletePost = (req, res) => {
  const q = "DELETE FROM posts WHERE `id`=?";
  db.query(q, [req.params.id], (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    if (data.affectedRows > 0)
      return res.status(200).json("Post has been deleted.");
    return res.status(403).json("You can delete only your post");
  });
};

export const deleteShort = (req, res) => {
  const q = "DELETE FROM shorts WHERE `id`=?";
  db.query(q, [req.params.id], (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    if (data.affectedRows > 0)
      return res.status(200).json("Short has been deleted.");
    return res.status(403).json("You can delete only your post");
  });
};
