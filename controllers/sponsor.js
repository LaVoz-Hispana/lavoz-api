import { db } from "../connect.js";

const isHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
};

const normalizeSponsorType = (value) => {
  const type = String(value || "regular").trim().toLowerCase();
  if (type === "regular" || type === "principle") return type;
  return null;
};

export const getSponsors = (req, res) => {
  db.query("SELECT id, name, logoUrl, link, sponsorType, createdAt FROM sponsors ORDER BY id ASC", (err, data) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json(data);
  });
};

export const getSponsorSection = (req, res) => {
  db.query(
    "SELECT sectionKey, contentEn, contentEs, updatedAt FROM homepage_sections WHERE sectionKey = 'sponsor_support' LIMIT 1",
    (err, data) => {
      if (err) return res.status(500).json(err);
      return res.status(200).json(data[0] || null);
    }
  );
};

export const updateSponsorSection = (req, res) => {
  const contentEn = String(req.body.contentEn || "").trim();
  const contentEs = String(req.body.contentEs || "").trim();

  if (!contentEn || !contentEs) {
    return res.status(400).json({ error: "Both English and Spanish sponsor messages are required." });
  }

  const q = `
    INSERT INTO homepage_sections (sectionKey, contentEn, contentEs, updatedByUserId)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      contentEn = VALUES(contentEn),
      contentEs = VALUES(contentEs),
      updatedByUserId = VALUES(updatedByUserId)
  `;

  db.query(q, ["sponsor_support", contentEn, contentEs, req.user?.id || null], (err) => {
    if (err) return res.status(500).json(err);
    return res.status(200).json({
      sectionKey: "sponsor_support",
      contentEn,
      contentEs,
    });
  });
};

export const createSponsor = (req, res) => {
  const name = String(req.body.name || "").trim();
  const logoUrl = String(req.body.logoUrl || "").trim();
  const link = String(req.body.link || "").trim();
  const sponsorType = normalizeSponsorType(req.body.sponsorType);

  if (!name || !logoUrl || !link) {
    return res.status(400).json({ error: "A sponsor name, logo, and link are required." });
  }
  if (!isHttpUrl(logoUrl) || !isHttpUrl(link)) {
    return res.status(400).json({ error: "Logo and link must be valid HTTP(S) URLs." });
  }
  if (!sponsorType) {
    return res.status(400).json({ error: "A valid sponsor type is required." });
  }

  const q = "INSERT INTO sponsors (`name`, `logoUrl`, `link`, `sponsorType`, `createdByUserId`) VALUES (?)";
  db.query(q, [[name, logoUrl, link, sponsorType, req.user.id]], (err, data) => {
    if (err) return res.status(500).json(err);
    return res.status(201).json({ id: data.insertId, name, logoUrl, link, sponsorType });
  });
};

export const updateSponsor = (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body.name || "").trim();
  const logoUrl = String(req.body.logoUrl || "").trim();
  const link = String(req.body.link || "").trim();
  const sponsorType = normalizeSponsorType(req.body.sponsorType);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "A valid sponsor id is required." });
  }
  if (!name || !logoUrl || !link) {
    return res.status(400).json({ error: "A sponsor name, logo, and link are required." });
  }
  if (!isHttpUrl(logoUrl) || !isHttpUrl(link)) {
    return res.status(400).json({ error: "Logo and link must be valid HTTP(S) URLs." });
  }
  if (!sponsorType) {
    return res.status(400).json({ error: "A valid sponsor type is required." });
  }

  const q = `
    UPDATE sponsors
    SET name = ?, logoUrl = ?, link = ?, sponsorType = ?
    WHERE id = ?
  `;

  db.query(q, [name, logoUrl, link, sponsorType, id], (err, data) => {
    if (err) return res.status(500).json(err);
    if (data.affectedRows === 0) return res.status(404).json({ error: "Sponsor not found." });
    return res.status(200).json({ id, name, logoUrl, link, sponsorType });
  });
};

export const deleteSponsor = (req, res) => {
  db.query("DELETE FROM sponsors WHERE id = ?", [req.params.id], (err, data) => {
    if (err) return res.status(500).json(err);
    if (data.affectedRows === 0) return res.status(404).json({ error: "Sponsor not found." });
    return res.status(200).json({ message: "Sponsor removed." });
  });
};
