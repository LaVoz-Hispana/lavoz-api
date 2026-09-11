import {db} from "../connect.js";
import { sendNotification } from "../utils/notificationHelper.js";

export const getLikes = (req,res) => {
    const q = "SELECT userId, reaction FROM likes WHERE postId = ?";

    db.query(q, [req.query.postId], (err, data) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(data);
    });
};

export const getShortLikes = (req, res) => {
    const q = "SELECT userId, reaction FROM short_likes WHERE shortId = ?";
    db.query(q, [req.query.shortId], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.status(200).json(data);
    });
}

export const getReaction = (req,res) => {
    const q = `SELECT \`reaction\` FROM likes WHERE id = ?`;
    const reactionId = parseInt(req.query.reactionId, 10);

    db.query(q, [reactionId], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.status(200).json(data);
    });
}

export const addLike = (req, res) => {
    const postId = Number(req.body.postId);
    if (!Number.isSafeInteger(postId) || postId <= 0) return res.status(400).json({ error: "Invalid post." });
    db.query("SELECT userId FROM posts WHERE id = ?", [postId], (error, posts) => {
        if (error) return res.status(500).json({ error: "Unable to load post." });
        if (!posts.length) return res.status(404).json({ error: "Post not found." });
        const q = "INSERT INTO likes(`userId`, `postId`, `reaction`) VALUES (?)";
        const values = [req.user.id, postId, req.body.reaction];

        db.query(q, [values], async (err, data) => {
            if (err) return res.status(500).json(err);
            await sendNotification(posts[0].userId, req.user.id, "reaction", data.insertId, postId);
            return res.status(200).json("Post has been liked.");
        });
    });
};

export const addShortLike = (req, res) => {
    const q = "INSERT INTO short_likes(`userId`, `shortId`, `reaction`) VALUES (?)";
    const values = [
        req.user.id,
        req.body.shortId,
        req.body.reaction
    ];

    db.query(q, [values], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.status(200).json("Short has been liked.");
    });
};

export const deleteLike = (req, res) => {
    const q = "DELETE FROM likes WHERE `userId` = ? AND `postId` = ?";

    db.query(q, [req.user.id, req.query.postId], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.status(200).json("Post has been disliked.");
    });
};

export const deleteShortLike = (req, res) => {
    const q = "DELETE FROM short_likes WHERE `userId` = ? AND `shortId` = ?";

    db.query(q, [req.user.id, req.query.shortId], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.status(200).json("Short has been disliked.");
    });
};
