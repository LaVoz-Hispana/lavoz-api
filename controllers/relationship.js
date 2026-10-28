import { db } from "../connect.js";
import { sendNotification } from "../utils/notificationHelper.js";
import { canViewStudentProfile } from "../services/studentPrivacy.js";

export const getRelationships = (req, res) => {
  const followedUserId = Number(req.query.followedUserId);
  if (!Number.isSafeInteger(followedUserId) || followedUserId <= 0)
    return res.status(400).json({ code: "invalid_id" });
  db.query(
    "SELECT id, account_type FROM users WHERE id = ?",
    [followedUserId],
    (userError, users) => {
      if (userError) return res.status(500).json({ code: "request_failed" });
      if (!users?.length)
        return res.status(404).json({ code: "user_not_found" });
      if (
        users[0].account_type === "student" &&
        !canViewStudentProfile(req.user, followedUserId)
      ) {
        return res.status(403).json({ code: "student_profile_private" });
      }
      const q =
        "SELECT r.followerUserId, u.account_type FROM relationships r JOIN users u ON u.id = r.followerUserId WHERE r.followedUserId = ?";
      db.query(q, [followedUserId], (err, data) => {
        if (err) return res.status(500).json({ code: "request_failed" });
        return res
          .status(200)
          .json(
            data.map((relationship) =>
              relationship.account_type === "student" &&
              !canViewStudentProfile(req.user, relationship.followerUserId)
                ? null
                : relationship.followerUserId,
            ),
          );
      });
    },
  );
};

export const addRelationship = (req, res) => {
  return follow(req, res, req.body.userId);
};

export const followUser = (req, res) => {
  return follow(req, res, req.body.followedId);
};

const follow = (req, res, target) => {
  const userTo = Number(target);
  if (
    !Number.isSafeInteger(userTo) ||
    userTo <= 0 ||
    userTo === Number(req.user.id)
  ) {
    return res.status(400).json({ error: "Invalid followed user." });
  }
  db.query(
    "SELECT id, account_type FROM users WHERE id = ?",
    [userTo],
    (error, users) => {
      if (error) return res.status(500).json({ error: "Unable to load user." });
      if (!users.length)
        return res.status(404).json({ error: "User not found." });
      if (
        users[0].account_type === "student" &&
        !canViewStudentProfile(req.user, userTo)
      ) {
        return res.status(403).json({ code: "student_profile_private" });
      }
      const sql =
        "INSERT INTO relationships (followerUserId, followedUserId) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM relationships WHERE followerUserId = ? AND followedUserId = ?)";
      db.query(
        sql,
        [req.user.id, userTo, req.user.id, userTo],
        async (err, data) => {
          if (err)
            return res.status(500).json({ error: "Unable to follow user." });
          if (data.affectedRows)
            await sendNotification(
              userTo,
              req.user.id,
              "follow",
              data.insertId,
            );
          return res.status(200).json("Following");
        },
      );
    },
  );
};

export const deleteRelationship = (req, res) => {
  const q =
    "DELETE FROM relationships WHERE `followerUserId` = ? AND `followedUserId` = ?";

  db.query(q, [req.user.id, req.query.userId], (err) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json("Unfollow");
  });
};

export const unfollowUser = (req, res) => {
  const q =
    "DELETE FROM relationships WHERE `followerUserId` = ? AND `followedUserId` = ?";

  db.query(q, [req.user.id, req.query.followedId], (err) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json("Unfollow");
  });
};
