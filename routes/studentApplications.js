import express from "express";
import multer from "multer";
import { pipeline } from "node:stream/promises";
import { validateToken } from "../jwt.js";
import { withTransaction } from "../services/notificationDb.js";
import { studentApplications } from "../services/studentApplications.js";
import { resumeStorage } from "../services/resumeStorage.js";
import { MAX_RESUME_BYTES } from "../services/resumeFiles.js";

const service = studentApplications({
  transaction: withTransaction,
  storage: resumeStorage,
  emailEnabled: () => process.env.NOTIFICATION_EMAIL_ENABLED === "true",
});
export const resumeRoutes = express.Router();
export const applicationRoutes = express.Router();

const handle = (work) => async (req, res, next) => {
  try {
    await work(req, res, next);
  } catch (error) {
    next(error);
  }
};
const authenticate = handle(async (req, res, next) => {
  // Resolve roles from the database so a stale token cannot grant resume access.
  const [user] = await withTransaction((query) =>
    query("SELECT id, account_type, is_admin FROM users WHERE id = ?", [
      req.user.id,
    ]),
  );
  if (!user) return res.status(401).json({ code: "unauthorized" });
  req.user = { ...user, is_admin: Boolean(user.is_admin) };
  next();
});
for (const router of [resumeRoutes, applicationRoutes]) {
  router.use((req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  router.use(validateToken());
  router.use(authenticate);
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RESUME_BYTES, files: 1, fields: 2, fieldSize: 1024 },
}).single("file");
const studentOnly = (req, res, next) =>
  req.user.account_type === "student"
    ? next()
    : res.status(403).json({ code: "forbidden" });

resumeRoutes.get(
  "/",
  handle(async (req, res) => res.json(await service.listResumes(req.user))),
);
resumeRoutes.post(
  "/",
  studentOnly,
  upload,
  handle(async (req, res) =>
    res
      .status(201)
      .json(await service.uploadResume(req.user, req.file, req.body.label)),
  ),
);
resumeRoutes.put(
  "/:id/file",
  studentOnly,
  upload,
  handle(async (req, res) =>
    res
      .status(201)
      .json(
        await service.uploadResume(
          req.user,
          req.file,
          req.body.label,
          req.params.id,
        ),
      ),
  ),
);
resumeRoutes.put(
  "/:id",
  handle(async (req, res) =>
    res.json(await service.updateResume(req.user, req.params.id, req.body)),
  ),
);
resumeRoutes.delete(
  "/:id",
  handle(async (req, res) => {
    await service.deleteResume(req.user, req.params.id);
    res.sendStatus(204);
  }),
);
resumeRoutes.get(
  "/:id/download",
  handle(async (req, res) => {
    const { resume, object } = await service.downloadResume(
      req.user,
      req.params.id,
    );
    res.set("Content-Type", resume.mimeType);
    res.set("X-Content-Type-Options", "nosniff");
    res.set(
      "Content-Disposition",
      `attachment; filename="resume.${resume.mimeType === "application/pdf" ? "pdf" : "docx"}"; filename*=UTF-8''${encodeURIComponent(resume.originalFileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`,
    );
    await pipeline(object.Body, res);
  }),
);
applicationRoutes.get(
  "/mine",
  handle(async (req, res) =>
    res.json(await service.mine(req.user, req.query.projectId)),
  ),
);
applicationRoutes.get(
  "/admin/projects/:projectId",
  handle(async (req, res) =>
    res.json(await service.forProjectAdmin(req.user, req.params.projectId)),
  ),
);
applicationRoutes.get(
  "/projects/:projectId",
  handle(async (req, res) =>
    res.json(await service.forProject(req.user, req.params.projectId)),
  ),
);
applicationRoutes.post(
  "/projects/:projectId",
  handle(async (req, res) =>
    res
      .status(201)
      .json(await service.submit(req.user, req.params.projectId, req.body)),
  ),
);
applicationRoutes.put(
  "/projects/:projectId/:id/:action",
  handle(async (req, res) =>
    res.json(
      await service.resolve(
        req.user,
        req.params.projectId,
        req.params.id,
        req.params.action,
      ),
    ),
  ),
);

for (const router of [resumeRoutes, applicationRoutes]) {
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof multer.MulterError)
      return res
        .status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400)
        .json({
          code:
            error.code === "LIMIT_FILE_SIZE"
              ? "resume_too_large"
              : "resume_invalid_upload",
        });
    if (!error.status)
      console.error("student_application_request_failed", {
        code: error.code || "INTERNAL_ERROR",
      });
    return res
      .status(error.status || 500)
      .json({ code: error.status ? error.code : "request_failed" });
  });
}
