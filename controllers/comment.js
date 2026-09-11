import {db} from "../connect.js";
import moment from "moment";
import { sendNotification } from "../utils/notificationHelper.js";

export const getComments = (req, res) => {
    const q = `SELECT c.*, u.id AS userId, username, profilePic FROM comments AS c JOIN users AS u ON (u.id = c.userId)
      WHERE c.postId = ? ORDER BY c.createdAt DESC`;

    db.query(q, [req.query.postId], (err, data) => {
      if (err) return res.status(500).json(err);
      return res.status(200).json(data);
    });
};

export const getCommentDesc = (req, res) => {
  const q = `SELECT \`desc\` FROM comments WHERE id = ?`;
  const commentId = parseInt(req.query.commentId, 10);

  db.query(q, [commentId], (err, data) => {
      if (err) return res.status(500).json(err);
      return res.status(200).json(data);
  });
}

export const addComment = (req, res) => {
  const postId = Number(req.body.postId);
  if (!Number.isSafeInteger(postId) || postId <= 0) return res.status(400).json({ error: "Invalid post." });
  db.query("SELECT userId FROM posts WHERE id = ?", [postId], (error, posts) => {
    if (error) return res.status(500).json({ error: "Unable to load post." });
    if (!posts.length) return res.status(404).json({ error: "Post not found." });
    const q = "INSERT INTO comments(`desc`, `createdAt`, `userId`, `postId`, `gif`) VALUES (?)";
    const values = [
      req.body.desc,
      moment(Date.now()).format("YYYY-MM-DD HH:mm:ss"),
      req.user.id,
      postId,
      req.body.gif
    ];

    db.query(q, [values], async (err, data) => {
      if (err) return res.status(500).json(err);
      const commentId = data.insertId;
      await sendNotification(posts[0].userId, req.user.id, "comment", commentId, postId);
      return res.status(200).json("Comment has been created.");
    });
  });
};
