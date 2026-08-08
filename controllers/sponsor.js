import { db } from "../connect.js";

const isHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
};

export const getSponsors = (req, res) => {
  db.query("SELECT id, name, logoUrl, link, createdAt FROM sponsors ORDER BY id ASC", (err, data) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(data);
  });
};

export const createSponsor = (req, res) => {
  const name = String(req.body.name || "").trim();
  const logoUrl = String(req.body.logoUrl || "").trim();
  const link = String(req.body.link || "").trim();

  if (!name || !logoUrl || !link) {
    return res.status(400).json({ error: "A sponsor name, logo, and link are required." });
  }
  if (!isHttpUrl(logoUrl) || !isHttpUrl(link)) {
    return res.status(400).json({ error: "Logo and link must be valid HTTP(S) URLs." });
  }

  const q = "INSERT INTO sponsors (`name`, `logoUrl`, `link`, `createdByUserId`) VALUES (?)";
  db.query(q, [[name, logoUrl, link, req.user.id]], (err, data) => {
    if (err) return res.status(500).json(err);
    return res.status(201).json({ id: data.insertId, name, logoUrl, link });
  });
};

export const deleteSponsor = (req, res) => {
  db.query("DELETE FROM sponsors WHERE id = ?", [req.params.id], (err, data) => {
    if (err) return res.status(500).json(err);
    if (data.affectedRows === 0) return res.status(404).json({ error: "Sponsor not found." });
    return res.status(200).json({ message: "Sponsor removed." });
  });
};
