import {db} from "../connect.js";
import { redactStudentIdentity } from "../services/studentPrivacy.js";
import { providerDisplayNameSql, providerTypeLabelSql } from "../services/providerIdentity.js";

export const getNotifications = (req, res) => {
  const q = `SELECT n.id, n.userTo,
      CASE WHEN n.type IN ('application_submitted', 'application_selected', 'application_rejected', 'application_withdrawn') THEN NULL ELSE n.userFrom END AS userFrom,
      n.type, n.createdAt, n.objectId, n.postId, n.new,
      CASE WHEN n.type IN ('application_submitted', 'application_selected', 'application_rejected', 'application_withdrawn') THEN NULL ELSE u.id END AS userId,
      CASE WHEN n.type IN ('application_submitted', 'application_selected', 'application_rejected', 'application_withdrawn') THEN NULL ELSE ${providerDisplayNameSql("u")} END AS username,
      CASE WHEN n.type IN ('application_submitted', 'application_selected', 'application_rejected', 'application_withdrawn') THEN NULL ELSE u.profilePic END AS profilePic,
      CASE WHEN n.type IN ('application_submitted', 'application_selected', 'application_rejected', 'application_withdrawn') THEN NULL ELSE ${providerTypeLabelSql("u")} END AS providerTypeLabel,
      CASE WHEN n.type IN ('application_submitted', 'application_selected', 'application_rejected', 'application_withdrawn') THEN NULL ELSE u.provider_type END AS provider_type,
      u.account_type AS authorAccountType
    FROM notifications AS n
    JOIN users AS u ON (u.id = n.userFrom)
    WHERE n.userTo = ? ORDER BY n.createdAt DESC LIMIT 30;`;
  db.query(q, [req.user.id], (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json(data.map((row) => redactStudentIdentity(row, req.user, { identityAliases: ["userFrom"] })));
  });
};

export const getNewNotifications = (req, res) => {
  const q = `SELECT id, type, objectId, createdAt, new FROM notifications WHERE new = 1 AND userTo = ?`;
  db.query(q, [req.user.id], (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json(data);
  });
};

export const getFollowNotif = (req, res) => {
  const q = `SELECT r.id FROM relationships r
    JOIN notifications n ON n.objectId = r.id AND n.type = 'follow'
    WHERE r.id = ? AND n.userTo = ?`;
  db.query(q, [req.query.id, req.user.id], (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json(data);
  });
};

export const getLikeNotif = (req, res) => {
  const q = `SELECT l.id, l.reaction FROM likes l
    JOIN notifications n ON n.objectId = l.id AND n.type = 'reaction'
    WHERE l.id = ? AND n.userTo = ?`;
  db.query(q, [req.query.id, req.user.id], (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json(data);
  });
};

export const getCommentNotif = (req, res) => {
  const q = `SELECT c.id, c.\`desc\` FROM comments c
    JOIN notifications n ON n.objectId = c.id AND n.type = 'comment'
    WHERE c.id = ? AND n.userTo = ?`;
  db.query(q, [req.query.id, req.user.id], (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json(data);
  });
};

export const clearNotifAlert = (req, res) => {
    const q = "UPDATE notifications SET new = ? WHERE id = ? AND userTo = ?";
    const values = [0, req.body.id, req.user.id];

    db.query(q, values, (err, data) => {
      if (err) {
          console.error("Error clearing notif alert:");
          return res.status(500).json("Error updating notification.");
      }
      return res.status(200).json("Notification alert cleared successfully.");
    });
};
