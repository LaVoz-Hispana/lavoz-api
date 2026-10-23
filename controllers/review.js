import { db } from "../connect.js";
import { canOpenProfile, redactStudentIdentity } from "../services/studentPrivacy.js";
import { providerDisplayNameSql, providerTypeLabelSql } from "../services/providerIdentity.js";

const withVisibleProfile = (req, res, userId, work) => {
  if (!canOpenProfile(req.user, userId)) return res.status(403).json({ code: "profile_private" });
  db.query("SELECT id, account_type FROM users WHERE id = ?", [userId], (error, users) => {
    if (error) return res.status(500).json({ code: "request_failed" });
    if (!users?.length) return res.status(404).json({ code: "user_not_found" });
    return work();
  });
};

const completedEscrowForReview = (escrowId, callback) => {
  db.query(
    `SELECT e.id, e.studentId, e.localId, e.status, p.id AS projectId, p.title AS projectTitle,
            p.description AS projectDescription, p.categoryId, p.createdAt AS projectCreatedAt,
            p.status AS projectStatus, e.resolvedAt,
            s.username AS studentUsername, s.profilePic AS studentProfilePic,
            ${providerDisplayNameSql("l")} AS localUsername, l.profilePic AS localProfilePic,
            ${providerTypeLabelSql("l")} AS localProviderTypeLabel
     FROM escrows e
     JOIN projects p ON p.id = e.projectId
     JOIN users s ON s.id = e.studentId
     JOIN users l ON l.id = e.localId
     WHERE e.id = ?`,
    [escrowId],
    (err, rows) => callback(err, rows?.[0])
  );
};

export const getEscrowReview = (req, res) => {
  const escrowId = Number(req.params.escrowId);
  if (!Number.isSafeInteger(escrowId) || escrowId <= 0) return res.status(400).json({ code: "invalid_id" });
  completedEscrowForReview(escrowId, (error, escrow) => {
    if (error) return res.status(500).json({ code: "request_failed" });
    if (!escrow) return res.status(404).json({ code: "escrow_not_found" });
    const isStudent = Number(req.user.id) === Number(escrow.studentId);
    if (!isStudent && Number(req.user.id) !== Number(escrow.localId)) return res.status(403).json({ code: "forbidden" });
    db.query("SELECT id, rating, commentary FROM project_reviews WHERE escrowId = ? AND reviewerId = ?", [escrowId, req.user.id], (reviewError, rows) => {
      if (reviewError) return res.status(500).json({ code: "request_failed" });
      return res.json({
        review: rows[0] || null,
        canReview: escrow.status === "completed",
        counterpartName: isStudent ? escrow.localUsername : escrow.studentUsername,
        counterpartProviderTypeLabel: isStudent ? escrow.localProviderTypeLabel : null,
      });
    });
  });
};

export const getCompletedProjectsForUser = (req, res) => {
  const profileUserId = Number(req.params.userId);
  if (!Number.isInteger(profileUserId) || profileUserId <= 0) {
    return res.status(400).json({ error: "A valid user id is required." });
  }

  const q = `
    SELECT e.id AS escrowId, e.studentId, e.localId, e.resolvedAt,
           p.id AS projectId, p.title AS projectTitle, p.description AS projectDescription,
           p.skills, p.timeline, p.status AS projectStatus,
           s.username AS studentUsername, s.profilePic AS studentProfilePic, s.account_type AS studentAccountType,
           ${providerDisplayNameSql("l")} AS localUsername, l.profilePic AS localProfilePic, l.account_type AS localAccountType,
           ${providerTypeLabelSql("l")} AS localProviderTypeLabel,
           r.id AS authoredReviewId, r.reviewerId AS authoredReviewerId, r.revieweeId AS authoredRevieweeId,
           r.rating AS authoredRating, r.commentary AS authoredCommentary, r.createdAt AS authoredReviewCreatedAt,
           received.id AS receivedReviewId, received.reviewerId AS receivedReviewerId,
           received.revieweeId AS receivedRevieweeId, received.rating AS receivedRating,
           received.commentary AS receivedCommentary, received.createdAt AS receivedReviewCreatedAt
    FROM escrows e
    JOIN projects p ON p.id = e.projectId
    JOIN users s ON s.id = e.studentId
    JOIN users l ON l.id = e.localId
    LEFT JOIN project_reviews r ON r.escrowId = e.id AND r.reviewerId = ?
    LEFT JOIN project_reviews received ON received.escrowId = e.id AND received.revieweeId = ?
    WHERE e.status = 'completed' AND (e.studentId = ? OR e.localId = ?)
    ORDER BY e.resolvedAt DESC, e.id DESC
  `;
  const viewerId = req.user?.id ?? 0;
  return withVisibleProfile(req, res, profileUserId, () => db.query(q, [viewerId, profileUserId, profileUserId, profileUserId], (err, rows) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    const projects = rows.map((row) => {
      const profileIsStudent = Number(row.studentId) === profileUserId;
      const identity = redactStudentIdentity({
        counterpartId: profileIsStudent ? row.localId : row.studentId,
        counterpartName: profileIsStudent ? row.localUsername : row.studentUsername,
        counterpartProfilePic: profileIsStudent ? row.localProfilePic : row.studentProfilePic,
        counterpartAccountType: profileIsStudent ? row.localAccountType : row.studentAccountType,
      }, req.user, { id: "counterpartId", username: "counterpartName", profilePic: "counterpartProfilePic", accountType: "counterpartAccountType" });
      const isParticipant = viewerId === row.studentId || viewerId === row.localId;
      return {
        escrowId: row.escrowId,
        resolvedAt: row.resolvedAt,
        projectId: row.projectId,
        projectTitle: row.projectTitle,
        projectDescription: row.projectDescription,
        skills: row.skills,
        timeline: row.timeline,
        projectStatus: row.projectStatus,
        authoredReviewId: row.authoredReviewId,
        authoredReviewerId: row.authoredReviewerId,
        authoredRating: row.authoredRating,
        authoredCommentary: row.authoredCommentary,
        receivedReviewId: row.receivedReviewId,
        receivedRating: row.receivedRating,
        receivedCommentary: row.receivedCommentary,
        counterpartId: identity.counterpartId,
        counterpartName: identity.counterpartName,
        counterpartProfilePic: identity.counterpartProfilePic,
        counterpartProfileVisible: identity.profileVisible,
        counterpartProviderTypeLabel: profileIsStudent ? row.localProviderTypeLabel : null,
        canReview: isParticipant && viewerId !== profileUserId && !row.authoredReviewId,
        canEditAuthoredReview: Boolean(row.authoredReviewId && Number(row.authoredReviewerId) === Number(viewerId)),
      };
    });
    return res.status(200).json(projects);
  }));
};

export const getUserReviews = (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: "A valid user id is required." });

  const summaryQ = `SELECT COUNT(*) AS reviewCount, ROUND(AVG(rating), 1) AS averageRating FROM project_reviews WHERE revieweeId = ?`;
  const reviewsQ = `
    SELECT r.id, r.escrowId, r.rating, r.commentary, r.createdAt,
           reviewer.id AS reviewerId, ${providerDisplayNameSql("reviewer")} AS reviewerUsername, reviewer.profilePic AS reviewerProfilePic,
           reviewer.account_type AS reviewerAccountType,
           ${providerTypeLabelSql("reviewer")} AS reviewerProviderTypeLabel,
           p.id AS projectId, p.title AS projectTitle
    FROM project_reviews r
    JOIN users reviewer ON reviewer.id = r.reviewerId
    JOIN escrows e ON e.id = r.escrowId
    JOIN projects p ON p.id = e.projectId
    WHERE r.revieweeId = ?
    ORDER BY r.createdAt DESC
  `;
  return withVisibleProfile(req, res, userId, () => db.query(summaryQ, [userId], (summaryErr, summaries) => {
    if (summaryErr) return res.status(500).json({ code: "request_failed" });
    db.query(reviewsQ, [userId], (reviewsErr, reviews) => {
      if (reviewsErr) return res.status(500).json({ code: "request_failed" });
      const visibleReviews = reviews.map((review) => {
        const visible = redactStudentIdentity(review, req.user, {
          id: "reviewerId", username: "reviewerUsername", profilePic: "reviewerProfilePic", accountType: "reviewerAccountType",
        });
        return { ...visible, reviewerProfileVisible: visible.profileVisible, profileVisible: undefined };
      });
      return res.status(200).json({ ...summaries[0], reviews: visibleReviews });
    });
  }));
};

export const createReview = (req, res) => {
  const escrowId = Number(req.params.escrowId);
  const rating = Number(req.body.rating);
  const commentary = req.body.commentary?.trim() || null;
  if (!Number.isInteger(escrowId) || !Number.isFinite(rating) || rating < 0.5 || rating > 5 || !Number.isInteger(rating * 2)) {
    return res.status(400).json({ error: "A completed project and a rating from 0.5 to 5 in half-star increments are required." });
  }
  if (commentary && commentary.length > 2000) return res.status(400).json({ error: "Commentary must be 2,000 characters or fewer." });

  completedEscrowForReview(escrowId, (err, escrow) => {
    if (err) return res.status(500).json({ code: "request_failed" });
    if (!escrow) return res.status(404).json({ error: "Project collaboration not found." });
    if (escrow.status !== "completed") return res.status(409).json({ error: "Reviews are available after the project is completed." });
    const reviewerId = req.user.id;
    if (reviewerId !== escrow.studentId && reviewerId !== escrow.localId) return res.status(403).json({ error: "Only project participants can leave a review." });
    const revieweeId = reviewerId === escrow.studentId ? escrow.localId : escrow.studentId;
    db.query(
      "INSERT INTO project_reviews (escrowId, reviewerId, revieweeId, rating, commentary) VALUES (?, ?, ?, ?, ?)",
      [escrowId, reviewerId, revieweeId, rating, commentary],
      (insertErr, result) => {
        if (insertErr?.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "You have already reviewed this project." });
        if (insertErr) return res.status(500).json({ code: "request_failed" });
        return res.status(201).json({ id: result.insertId, message: "Review submitted." });
      }
    );
  });
};

export const updateReview = (req, res) => {
  const reviewId = Number(req.params.reviewId);
  const rating = Number(req.body.rating);
  const commentary = req.body.commentary?.trim() || null;
  if (!Number.isInteger(reviewId) || !Number.isFinite(rating) || rating < 0.5 || rating > 5 || !Number.isInteger(rating * 2)) {
    return res.status(400).json({ error: "A rating from 0.5 to 5 in half-star increments is required." });
  }
  if (commentary && commentary.length > 2000) return res.status(400).json({ error: "Commentary must be 2,000 characters or fewer." });

  // Include the writer in the UPDATE predicate so authorization is enforced by
  // the write itself, rather than trusting a prior read.
  db.query(
    "UPDATE project_reviews SET rating = ?, commentary = ? WHERE id = ? AND reviewerId = ?",
    [rating, commentary, reviewId, req.user.id],
    (updateErr, result) => {
      if (updateErr) return res.status(500).json({ code: "request_failed" });
      if (!result.affectedRows) {
        return res.status(403).json({ error: "You can only edit your own review." });
      }
      return res.status(200).json({ message: "Review updated." });
    }
  );
};
