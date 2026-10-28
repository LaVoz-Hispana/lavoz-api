import { db } from "../connect.js";
import moment from "moment";

export const getEmbeds = (req, res) => {
  const q = `SELECT * FROM embeds ORDER BY createdAt DESC LIMIT 20`;

  db.query(q, [], (err, data) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(data);
  });
};

export const addEmbed = (req, res) => {
  const q = "INSERT INTO embeds(`createdAt`, `type`, `link`) VALUES (?)";
  const values = [
    moment(Date.now()).format("YYYY-MM-DD HH:mm:ss"),
    req.body.type,
    req.body.link,
  ];

  db.query(q, [values], (err) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json("Embed has been created.");
  });
};

export const deleteEmbed = (req, res) => {
  const q = "DELETE FROM embeds WHERE `id`=?";

  db.query(q, [req.params.id], (err, data) => {
    if (err) return res.status(500).json(err);
    if (data.affectedRows > 0)
      return res.status(200).json("Embed has been deleted.");
    return res.status(403).json("You can delete only your embed");
  });
};
