import {db} from "../connect.js";

export const getNotifications = (req, res) => {
  const q = `SELECT n.*, u.id AS userId, username, profilePic FROM notifications AS n JOIN users AS u ON (u.id = n.userFrom) WHERE userTo = ? ORDER BY createdAt DESC LIMIT 30;`;
  db.query(q, [req.user.id], (err, data) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(data);
  });
};

export const getNewNotifications = (req, res) => {
  const q = `SELECT * FROM notifications WHERE new = 1 AND userTo = ?`;
  db.query(q, [req.user.id], (err, data) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(data);
  });
};

export const getFollowNotif = (req, res) => {
  const q = `SELECT * FROM relationships WHERE id = ?`;
  db.query(q, [req.query.id], (err, data) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(data);
  });
};

export const getLikeNotif = (req, res) => {
  const q = `SELECT * FROM likes WHERE id = ?`;
  db.query(q, [req.query.id], (err, data) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(data);
  });
};

export const getCommentNotif = (req, res) => {
  const q = `SELECT * FROM comments WHERE id = ?`;
  db.query(q, [req.query.id], (err, data) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(data);
  });
};

export const clearNotifAlert = (req, res) => {
    const q = "UPDATE notifications SET new = ? WHERE id = ? AND userTo = ?";
    const values = [0, req.body.id, req.user.id];

    db.query(q, values, (err, data) => {
      if (err) {
          console.error("Error clearing notif alert:", err);
          return res.status(500).json("Error updating notification.");
      }
      return res.status(200).json("Notification alert cleared successfully.");
    });
};
