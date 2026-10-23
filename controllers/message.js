import {db} from "../connect.js";
import moment from "moment";
import { redactStudentIdentity } from "../services/studentPrivacy.js";
import { providerDisplayNameSql, providerTypeLabelSql } from "../services/providerIdentity.js";

export const getMessages = (req, res) => {
  const q = `
    SELECT m.*, u.id AS userId, ${providerDisplayNameSql("u")} AS username, u.name, u.profilePic,
      ${providerTypeLabelSql("u")} AS providerTypeLabel, u.provider_type, u.account_type AS authorAccountType
    FROM messages AS m JOIN users AS u ON (u.id = m.msgFrom)
    WHERE (msgFrom = ? AND msgTo = ?)
      OR (msgTo = ? AND msgFrom = ?)
    ORDER BY createdAt
    LIMIT 100;
  `;
  const params = [req.user.id, req.query.userId, req.user.id, req.query.userId];

  db.query(q, params, (err, data) => {
    if (err) {
      console.error("Error executing SQL query:");
      return res.status(500).json({ code: "request_failed" });
    }
    return res.status(200).json(data.map((row) => redactStudentIdentity(row, req.user, { names: ["name"], identityAliases: ["msgFrom"] })));
  });
};

export const getNewMessages = (req, res) => {
  const q = `SELECT id, createdAt FROM messages WHERE \`read\` = 0 AND msgTo = ?`;
  db.query(q, [req.user.id], (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json(data);
  });
};

export const markAsRead = (req, res) => {
    const q = "UPDATE messages SET \`read\` = ? WHERE id = ? AND msgTo = ?";
    const values = [1, req.body.id, req.user.id];

  db.query(q, values, (err, data) => {
    if (err) {
        console.error("Error clearing msg alert:");
        return res.status(500).json("Error updating msg notification.");
    }
    return res.status(200).json("Message alert cleared successfully.");
  });
};

export const getAllMessages = (req, res) => {
  const currentUserId = req.user.id;
  const q = `
      SELECT
          u.id AS user_id,
          ${providerDisplayNameSql("u")} AS user_username,
          u.name AS user_name,
          u.profilePic AS user_profile_pic,
          u.account_type AS user_account_type,
          ${providerTypeLabelSql("u")} AS user_provider_type_label,
          u.provider_type AS user_provider_type,
          m.latest_message_time,
          m.latest_message_content,
          m.latest_message_read,
          m.latest_message_to
      FROM
          users u
          JOIN
          (
              SELECT
                  LEAST(msgFrom, msgTo) AS user_a,
                  GREATEST(msgFrom, msgTo) AS user_b,
                  MAX(createdAt) AS latest_message_time,
                  SUBSTRING_INDEX(GROUP_CONCAT(msg ORDER BY createdAt DESC), ',', 1) AS latest_message_content,
                  SUBSTRING_INDEX(GROUP_CONCAT(\`read\` ORDER BY createdAt DESC), ',', 1) AS latest_message_read,
                  SUBSTRING_INDEX(GROUP_CONCAT(msgTo ORDER BY createdAt DESC), ',', 1) AS latest_message_to
              FROM messages
              WHERE ? IN (msgFrom, msgTo)
              GROUP BY user_a, user_b
          ) AS m
          ON u.id IN (m.user_a, m.user_b) AND u.id != ?
      ORDER BY
          m.latest_message_time DESC;
    `;

  db.query(q, [currentUserId, currentUserId], (err, data) => {
    if (err) {
      console.error("Error executing SQL query:");
      return res.status(500).json({ code: "request_failed" });
    }
    if (!data || data.length === 0) {
      return res.status(204).json("No messages found.");
    }
    return res.status(200).json(data.map((row) => {
      const visible = redactStudentIdentity(row, req.user, {
        id: "user_id", username: "user_username", profilePic: "user_profile_pic",
        accountType: "user_account_type", names: ["user_name"],
      });
      return { ...visible, user_profile_visible: visible.profileVisible, profileVisible: undefined };
    }));
  });
};

export const getMessageParticipant = (req, res) => {
  const participantId = Number(req.params.userId);
  if (!Number.isSafeInteger(participantId) || participantId <= 0) return res.status(400).json({ code: "invalid_id" });
  const q = `SELECT u.id, ${providerDisplayNameSql("u")} AS username, u.name, u.profilePic,
    ${providerTypeLabelSql("u")} AS providerTypeLabel, u.provider_type, u.account_type AS authorAccountType
    FROM users u WHERE u.id = ? AND EXISTS (
      SELECT 1 FROM messages m WHERE (m.msgFrom = ? AND m.msgTo = u.id) OR (m.msgTo = ? AND m.msgFrom = u.id)
    ) LIMIT 1`;
  db.query(q, [participantId, req.user.id, req.user.id], (error, rows) => {
    if (error) return res.status(500).json({ code: "request_failed" });
    if (!rows?.length) return res.status(404).json({ code: "user_not_found" });
    return res.status(200).json(redactStudentIdentity(rows[0], req.user, { id: "id", names: ["name"] }));
  });
};

export const addMessage = (req, res) => {
  const q = "INSERT INTO messages(`msg`, `createdAt`, `msgTo`, `msgFrom`) VALUES (?)";
  const values = [
    req.body.msg,
    moment(Date.now()).format("YYYY-MM-DD HH:mm:ss"),
    req.body.msgTo,
    req.user.id,
  ];

  db.query(q, [values], (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json("Message has been sent.");
  });
};
