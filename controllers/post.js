import {db} from "../connect.js"
import moment from "moment"
import jwt from "jsonwebtoken";
import schedule from "node-schedule";

export const getTopPosts = (req, res) => {
    const q = `
      SELECT p.*, u.id AS userId, username, profilePic, COUNT(l.userId) AS likeCount
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
      if (err) return res.status(500).json(err);
      return res.status(200).json(data);
    });
};

export const getLatestNews = (req, res) => {
    const q = `
      SELECT p.*, u.id AS userId, name, profilePic
      FROM posts AS p
      JOIN users AS u ON (u.id = p.userId)
      WHERE p.createdAt >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
      AND (p.category = "news" OR p.category = "local" OR p.category = "latam" OR p.category = "usa" OR p.category = "global")
      ORDER BY p.createdAt DESC
    `;

    db.query(q, (err, data) => {
      if (err) return res.status(500).json(err);
      return res.status(200).json(data);
    });
};

export const getPosts = async (req, res) => {
  const userId = req.query.userId;
  const token = req.cookies.accessToken;
  const limit = 25;
  let q;
  let values;

  if (token) {
    jwt.verify(token, process.env.JWT_SECRET, (err, userInfo) => {
      if (err) {
        console.error("Error verifying token:", err);
      } else {
        if (userId && userId !== "undefined") {
            q = `SELECT p.*, u.id AS userId, username, profilePic, pr.title AS projectTitle FROM posts AS p JOIN users AS u ON (u.id = p.userId) LEFT JOIN projects AS pr ON (pr.id = p.projectId) WHERE p.userId = ? ORDER BY p.createdAt DESC LIMIT ${limit}`;
            values = [userId];
        } else {
            q = `SELECT p.*, u.id AS userId, username, profilePic, pr.title AS projectTitle FROM posts AS p JOIN users AS u ON (u.id = p.userId) LEFT JOIN projects AS pr ON (pr.id = p.projectId) ORDER BY p.createdAt DESC LIMIT ${limit}`;
            values = [];
        }
      }
    });
  } else {
    q = `SELECT p.*, u.id AS userId, username, profilePic, pr.title AS projectTitle FROM posts AS p JOIN users AS u ON (u.id = p.userId) LEFT JOIN projects AS pr ON (pr.id = p.projectId) ORDER BY p.createdAt DESC LIMIT ${limit}`;
    values = [];
  }

  db.query(q, values, (err, data) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(data);
  });
};

export const getProjectPosts = (req, res) => {
  const { projectId } = req.params;
  const q = `
    SELECT p.*, u.id AS userId, username, profilePic, pr.title AS projectTitle
    FROM posts AS p
    JOIN users AS u ON (u.id = p.userId)
    LEFT JOIN projects AS pr ON (pr.id = p.projectId)
    WHERE p.projectId = ?
    ORDER BY p.createdAt DESC
  `;
  db.query(q, [projectId], (err, data) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(data);
  });
};

export const getShorts = (req, res) => {
  const q =
  `SELECT v.*, u.id AS userId, username, profilePic FROM shorts AS v JOIN users AS u ON (u.id = v.userId)
  ORDER BY v.createdAt DESC LIMIT 30`;

 db.query(q, (err, data) => {
   if (err) return res.status(500).json(err);
   return res.status(200).json(data);
 });
}

export const getEvents = (req, res) => {
    const q =
     `SELECT e.*, u.id AS userId, username, profilePic FROM events AS e JOIN users AS u ON (u.id = e.userId)
     WHERE e.date >= DATE(NOW())
     ORDER BY e.date ASC`;

    db.query(q, (err, data) => {
      if (err) return res.status(500).json(err);
      return res.status(200).json(data);
    });
};

export const getJobs = (req, res) => {
    const q =
     `SELECT j.*, u.id AS userId, username, profilePic FROM jobs AS j JOIN users AS u ON (u.id = j.userId)
     ORDER BY j.createdAt DESC`;

    db.query(q, (err, data) => {
      if (err) return res.status(500).json(err);
      return res.status(200).json(data);
    });
};

export const findPost = (req, res) => {
    const q = `SELECT p.*, u.id AS userId, username, profilePic, pr.title AS projectTitle FROM posts AS p JOIN users AS u ON (u.id = p.userId) LEFT JOIN projects AS pr ON (pr.id = p.projectId) WHERE p.id = ?`;
    db.query(q, [req.query.id], (err, data) => {
      if (err) return res.status(500).json(err);
      return res.status(200).json(data);
    });
}

export const addPost = (req, res) => {
    const q =
      "INSERT INTO posts(`desc`, `img0`, `img1`, `img2`, `img3`, `img4`, `img5`, `img6`, `img7`, `img8`, `img9`, `createdAt`, `userId`, `category`, `flag`, `article`, `url`, `projectId`, `postType`) VALUES (?)";
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
      req.body.projectId || null,
      req.body.postType || null,
    ];
    db.query(q, [values], (err) => {
      if (err) return res.status(500).json(err);
      return res.status(200).json("Post has been created.");
    });
};

export const addShort = (req, res) => {
    const q = "INSERT INTO shorts(`desc`, `videoURL`, `createdAt`, `userId`) VALUES (?)";
    const values = [
      req.body.desc,
      req.body.imgUrl,
      moment(Date.now()).format("YYYY-MM-DD HH:mm:ss"),
      req.user.id,
    ];
    db.query(q, [values], (err) => {
      if (err) return res.status(500).json(err);
      return res.status(200).json("Short has been created.");
    });
}

export const addEvent = (req, res) => {
    const dateTimeStr = `${req.body.date} ${req.body.time}`;
    const q = "INSERT INTO events(`name`, `location`, `date`, `description`, `file`, `url`, `userId`, `category`) VALUES (?)";
    const values = [
      req.body.name,
      req.body.location,
      moment(dateTimeStr).format("YYYY-MM-DD HH:mm:ss"),
      req.body.description,
      req.body.img,
      req.body.url,
      req.user.id,
      req.body.category
    ];
    db.query(q, [values], (err, data) => {
      if (err) return res.status(500).json(err);
      return res.status(200).json("Event has been created.");
    });
};

export const deleteEvent = (req, res) => {
    const q = "DELETE FROM events WHERE `id`=?";

    db.query(q, [req.params.id], (err, data) => {
      if (err) return res.status(500).json(err);
      if(data.affectedRows>0) return res.status(200).json("Post has been deleted.");
      return res.status(403).json("You can delete only your post")
    });
};

export const addJob = (req, res) => {
    const q = "INSERT INTO jobs(`name`, `category`, `pay`, `schedule`, `location`, `description`, `contact`, `userId`, `img`, `createdAt`, `url`) VALUES (?)";
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
      req.body.url
    ];

    db.query(q, [values], (err, data) => {
      if (err) return res.status(500).json(err);
      return res.status(200).json("Job has been created.");
    });
};

export const deleteJob = (req, res) => {
    const q = "DELETE FROM jobs WHERE `id`=?";

    db.query(q, [req.params.id], (err, data) => {
      if (err) return res.status(500).json(err);
      if(data.affectedRows>0) return res.status(200).json("Post has been deleted.");
      return res.status(403).json("You can delete only your post")
    });
};

export const deletePost = (req, res) => {
    const q = "DELETE FROM posts WHERE `id`=?";
    db.query(q, [req.params.id], (err, data) => {
      if (err) return res.status(500).json(err);
      if(data.affectedRows>0) return res.status(200).json("Post has been deleted.");
      return res.status(403).json("You can delete only your post")
    });
};

export const deleteShort = (req, res) => {
    const q = "DELETE FROM shorts WHERE `id`=?";
    db.query(q, [req.params.id], (err, data) => {
      if (err) return res.status(500).json(err);
      if(data.affectedRows>0) return res.status(200).json("Short has been deleted.");
      return res.status(403).json("You can delete only your post")
    });
};
