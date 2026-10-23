import { db } from "../connect.js";

export const isAdmin = (user) => Boolean(user?.is_admin) || user?.account_type === "admin";

export const canOpenProfile = (viewer, userId) => Boolean(viewer)
  && Number.isSafeInteger(Number(userId)) && Number(userId) > 0
  && Number(viewer.id) === Number(userId);

export const canViewStudentProfile = (viewer, studentId) => Boolean(viewer) && (
  Number(viewer.id) === Number(studentId) || viewer.account_type === "local" || isAdmin(viewer)
);

export const refreshViewer = (req, res, next) => {
  if (!req.user?.id) return next();
  db.query("SELECT id, account_type, is_admin FROM users WHERE id = ?", [req.user.id], (error, users) => {
    if (error) return res.status(500).json({ code: "request_failed" });
    if (!users?.length) return res.status(401).json({ code: "unauthorized" });
    req.user = { ...users[0], is_admin: isAdmin(users[0]) };
    return next();
  });
};

export const privateNoStore = (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  res.vary("Cookie");
  res.vary("Authorization");
  next();
};

export const requireRoles = (...roles) => (req, res, next) => {
  const permitted = roles.some((role) => role === "admin" ? isAdmin(req.user) : req.user?.account_type === role);
  return permitted ? next() : res.status(403).json({ code: "forbidden" });
};

export function redactStudentIdentity(row, viewer, fields = {}) {
  const result = { ...row };
  const idField = fields.id || "userId";
  const usernameField = fields.username || "username";
  const profilePicField = fields.profilePic || "profilePic";
  const accountTypeField = fields.accountType || "authorAccountType";
  const nameFields = fields.names || [];
  const accountType = result[accountTypeField];
  const visible = accountType !== "student" || canViewStudentProfile(viewer, result[idField]);

  if (!visible) {
    result[idField] = null;
    result[usernameField] = "Student";
    result[profilePicField] = null;
    for (const field of [...nameFields, ...(fields.identityAliases || [])]) result[field] = null;
  }
  result.profileVisible = visible;
  delete result[accountTypeField];
  return result;
}

export function redactTaggedUsers(value, viewer) {
  if (!value) return value;
  return String(value).split("||").map((tag) => {
    const [id, username, accountType] = tag.split("::");
    if (accountType === "student" && !canViewStudentProfile(viewer, id)) return "::Student";
    return `${id}::${username}`;
  }).join("||");
}

export function redactTaggedContent(row, viewer) {
  const result = { ...row };
  if (!result.taggedUsers) return result;

  for (const tag of String(result.taggedUsers).split("||")) {
    const [id, username, accountType] = tag.split("::");
    if (accountType !== "student" || canViewStudentProfile(viewer, id) || !username) continue;
    const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const mention = new RegExp(`@${escapedUsername}(?![\\w-]|\\.[\\w-])`, "gi");
    for (const field of ["desc", "article"]) {
      if (typeof result[field] === "string") result[field] = result[field].replace(mention, "@Student");
    }
  }

  result.taggedUsers = redactTaggedUsers(result.taggedUsers, viewer);
  return result;
}

