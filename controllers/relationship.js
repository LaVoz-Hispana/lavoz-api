import {db} from "../connect.js";
import { sendNotification } from "../utils/notificationHelper.js";

export const getRelationships = (req,res) => {
    const q = "SELECT followerUserId FROM relationships WHERE followedUserId = ?";
    db.query(q, [req.query.followedUserId], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.status(200).json(data.map(relationship=>relationship.followerUserId));
    });
}

export const addRelationship = (req, res) => {
    return follow(req, res, req.body.userId);
};

export const followUser = (req, res) => {
    return follow(req, res, req.body.followedId);
};

const follow = (req, res, target) => {
    const userTo = Number(target);
    if (!Number.isSafeInteger(userTo) || userTo <= 0 || userTo === Number(req.user.id)) {
        return res.status(400).json({ error: "Invalid followed user." });
    }
    db.query("SELECT id FROM users WHERE id = ?", [userTo], (error, users) => {
        if (error) return res.status(500).json({ error: "Unable to load user." });
        if (!users.length) return res.status(404).json({ error: "User not found." });
        const sql = "INSERT INTO relationships (followerUserId, followedUserId) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM relationships WHERE followerUserId = ? AND followedUserId = ?)";
        db.query(sql, [req.user.id, userTo, req.user.id, userTo], async (err, data) => {
            if (err) return res.status(500).json({ error: "Unable to follow user." });
            if (data.affectedRows) await sendNotification(userTo, req.user.id, "follow", data.insertId);
            return res.status(200).json("Following");
        });
    });
};

export const deleteRelationship = (req, res) => {
    const q = "DELETE FROM relationships WHERE `followerUserId` = ? AND `followedUserId` = ?";

    db.query(q, [req.user.id, req.query.userId], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.status(200).json("Unfollow");
    });
};

export const unfollowUser = (req, res) => {
    const q = "DELETE FROM relationships WHERE `followerUserId` = ? AND `followedUserId` = ?";

    db.query(q, [req.user.id, req.query.followedId], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.status(200).json("Unfollow");
    });
};
