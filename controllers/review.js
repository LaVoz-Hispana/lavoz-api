import { db } from "../connect.js";

const completedEscrowForReview = (escrowId, callback) => {
  db.query(
    `SELECT e.id, e.studentId, e.localId, e.status, p.id AS projectId, p.title AS projectTitle,
            p.description AS projectDescription, p.categoryId, p.createdAt AS projectCreatedAt,
            p.status AS projectStatus, e.resolvedAt,
            s.username AS studentUsername, s.profilePic AS studentProfilePic,
            l.username AS localUsername, l.profilePic AS localProfilePic
     FROM escrows e
     JOIN projects p ON p.id = e.projectId
     JOIN users s ON s.id = e.studentId
     JOIN users l ON l.id = e.localId
     WHERE e.id = ?`,
    [escrowId],
    (err, rows) => callback(err, rows?.[0])
  );
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
           s.username AS studentUsername, s.profilePic AS studentProfilePic,
           l.username AS localUsername, l.profilePic AS localProfilePic,
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
  db.query(q, [viewerId, profileUserId, profileUserId, profileUserId], (err, rows) => {
    if (err) return res.status(500).json(err);
    const projects = rows.map((row) => {
      const counterpartId = row.studentId === profileUserId ? row.localId : row.studentId;
      const isParticipant = viewerId === row.studentId || viewerId === row.localId;
      return {
        ...row,
        counterpartId,
        counterpartName: row.studentId === profileUserId ? row.localUsername : row.studentUsername,
        counterpartProfilePic: row.studentId === profileUserId ? row.localProfilePic : row.studentProfilePic,
        canReview: isParticipant && viewerId !== profileUserId && !row.authoredReviewId,
        // Only the review authored by the authenticated viewer can be edited.
        canEditAuthoredReview: Boolean(
          row.authoredReviewId && Number(row.authoredReviewerId) === Number(viewerId)
        ),
      };
    });
    return res.status(200).json(projects);
  });
};

export const getUserReviews = (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: "A valid user id is required." });

  const summaryQ = `SELECT COUNT(*) AS reviewCount, ROUND(AVG(rating), 1) AS averageRating FROM project_reviews WHERE revieweeId = ?`;
  const reviewsQ = `
    SELECT r.id, r.escrowId, r.rating, r.commentary, r.createdAt,
           reviewer.id AS reviewerId, reviewer.username AS reviewerUsername, reviewer.profilePic AS reviewerProfilePic,
           p.id AS projectId, p.title AS projectTitle
    FROM project_reviews r
    JOIN users reviewer ON reviewer.id = r.reviewerId
    JOIN escrows e ON e.id = r.escrowId
    JOIN projects p ON p.id = e.projectId
    WHERE r.revieweeId = ?
    ORDER BY r.createdAt DESC
  `;
  db.query(summaryQ, [userId], (summaryErr, summaries) => {
    if (summaryErr) return res.status(500).json(summaryErr);
    db.query(reviewsQ, [userId], (reviewsErr, reviews) => {
      if (reviewsErr) return res.status(500).json(reviewsErr);
      return res.status(200).json({ ...summaries[0], reviews });
    });
  });
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
    if (err) return res.status(500).json(err);
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
        if (insertErr) return res.status(500).json(insertErr);
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
      if (updateErr) return res.status(500).json(updateErr);
      if (!result.affectedRows) {
        return res.status(403).json({ error: "You can only edit your own review." });
      }
      return res.status(200).json({ message: "Review updated." });
    }
  );
};
