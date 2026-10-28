import { db } from "../connect.js";
import moment from "moment";
import { redactStudentIdentity } from "../services/studentPrivacy.js";
import {
  providerDisplayNameSql,
  providerTypeLabelSql,
} from "../services/providerIdentity.js";

const visibleAds = (rows, viewer) =>
  rows.map((row) => redactStudentIdentity(row, viewer));

export const getPendingAds = async (req, res) => {
  const q = `SELECT a.*, u.id AS userId, ${providerDisplayNameSql("u")} AS username, profilePic,
       ${providerTypeLabelSql("u")} AS providerTypeLabel, u.provider_type, u.account_type AS authorAccountType
       FROM ads AS a JOIN users AS u ON (u.id = a.userId) WHERE a.approved = false ORDER BY a.createdAt DESC`;

  db.query(q, (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json(visibleAds(data, req.user));
  });
};

export const getApprovedAds = async (req, res) => {
  const q = `SELECT a.*, u.id AS userId, ${providerDisplayNameSql("u")} AS username, profilePic,
       ${providerTypeLabelSql("u")} AS providerTypeLabel, u.provider_type, u.account_type AS authorAccountType
       FROM ads AS a JOIN users AS u ON (u.id = a.userId) WHERE a.approved = true ORDER BY a.createdAt DESC`;

  db.query(q, (err, data) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json(visibleAds(data, req.user));
  });
};

export const postAd = (req, res) => {
  const sanitizedDesc = req.body.desc.replace(/\n/g, "\n");
  const q =
    "INSERT INTO ads(`desc`, `img0`, `img1`, `img2`, `img3`, `img4`, `img5`, `img6`, `img7`, `img8`, `img9`, `createdAt`, `userId`, `category`, `approved`) VALUES (?)";
  const values = [
    sanitizedDesc,
    req.body.img0,
    req.body.img1,
    req.body.img2,
    req.body.img3,
    req.body.img4,
    req.body.img5,
    req.body.img6,
    req.body.img7,
    req.body.img8,
    req.body.img9,
    moment(Date.now()).format("YYYY-MM-DD HH:mm:ss"),
    req.user.id,
    req.body.category,
    false,
  ];

  db.query(q, [values], (err) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    return res.status(200).json("Ad has been created.");
  });
};

export const approveAd = (req, res) => {
  const q = "UPDATE ads SET approved = ? WHERE id = ?";
  const values = [req.body.approved, req.body.id];

  db.query(q, values, (err) => {
    if (err) {
      console.log("Error updating ad:");
      return res.status(500).json("Error updating ad.");
    }
    console.log("Ad updated successfully!");
    if (req.body.approved === false) {
      console.log("h");
      deleteAd(req.body.id);
      return;
    } else {
      convertToPost(
        req.body.desc,
        req.body.img0,
        req.body.img1,
        req.body.img2,
        req.body.img3,
        req.body.img4,
        req.body.img5,
        req.body.img6,
        req.body.img7,
        req.body.img8,
        req.body.img9,
        req.user.id,
        req.body.category,
      );
      return res.status(200).json("Ad approved successfully.");
    }
  });
};

const convertToPost = (
  desc,
  img0,
  img1,
  img2,
  img3,
  img4,
  img5,
  img6,
  img7,
  img8,
  img9,
  userId,
  category,
) => {
  const q =
    "INSERT INTO posts(`desc`, `img0`, `img1`, `img2`, `img3`, `img4`, `img5`, `img6`, `img7`, `img8`, `img9`, `createdAt`, `userId`, `category`, `ad`) VALUES (?)";
  const values = [
    desc,
    img0,
    img1,
    img2,
    img3,
    img4,
    img5,
    img6,
    img7,
    img8,
    img9,
    moment(Date.now()).format("YYYY-MM-DD HH:mm:ss"),
    userId,
    category,
    true,
  ];

  db.query(q, [values], (err) => {
    if (err) console.error("Error creating post from ad.");
    return;
  });
};

const deleteAd = (id) => {
  const q = "DELETE FROM ads WHERE id=?";
  db.query(q, id, (err, data) => {
    if (err) console.log("Error deleting add.");
    if (data.affectedRows > 0) return;
  });
};
