import {db} from "../connect.js";

export const getUser = (req, res) => {
    const userId = req.params.userId;
    const q = "SELECT * FROM users WHERE id=?";

    db.query(q, [userId], (err, data) => {
      if (err) return res.status(500).json(err);
      if (!data || data.length === 0) return res.status(500).json("Password undefined");
      const { password, ...info } = data[0];
      return res.json(info);
    });
};

export const getAllUsers = (req, res) => {
    const { type } = req.query;
    const allowed = ["student", "local", "admin"];

    const q = type && allowed.includes(type)
        ? "SELECT * FROM users WHERE account_type = ?"
        : "SELECT * FROM users";
    const params = type && allowed.includes(type) ? [type] : [];

    db.query(q, params, (err, data) => {
      if (err) {
        console.error("Error fetching users:", err);
        return res.status(500).json({ error: "Internal Server Error" });
      }
      const usersWithoutPassword = data.map(({ password, ...u }) => u);
      return res.json(usersWithoutPassword);
    });
};

export const getFollowers = (req, res) => {
    const q = `SELECT users.* FROM users
               JOIN relationships ON users.id = relationships.followerUserId
               WHERE relationships.followedUserId = ?`;

    db.query(q, [req.user.id], (err, data) => {
      if (err) {
        console.error("Error fetching users:", err);
        return res.status(500).json({ error: "Internal Server Error" });
      }
      const usersWithoutPassword = data.map((user) => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      return res.json(usersWithoutPassword);
    });
}

export const getFollowing = (req, res) => {
    const q = "SELECT users.* FROM users JOIN relationships ON users.id = relationships.followedUserId WHERE relationships.followerUserId = ?";

    db.query(q, [req.user.id], (err, data) => {
      if (err) {
        console.error("Error fetching users:", err);
        return res.status(500).json({ error: "Internal Server Error" });
      }
      const usersWithoutPassword = data.map((user) => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      return res.json(usersWithoutPassword);
    });
}

export const updateUser = (req, res) => {
    const q =
      "UPDATE users SET `name`=?,`city`=?,`language`=?,`profilePic`=?,`coverPic`=?,`instagram`=?,`twitter`=?,`facebook`=?,`website`=?,`account_type`=?,`business_type`=?,`bio`=?,`skills`=?,`university`=?,`major`=?,`grad_year`=?,`phone`=? WHERE id=?";

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
        req.body.account_type,
        req.body.business_type,
        req.body.bio,
        req.body.skills ?? null,
        req.body.university ?? null,
        req.body.major ?? null,
        req.body.grad_year ?? null,
        req.body.phone ?? null,
        req.user.id,
      ],
      (err, data) => {
        if (err) res.status(500).json(err);
        if (data.affectedRows > 0) return res.json("Updated!");
        return res.status(403).json("You can update only your profile!");
      }
    );
};
