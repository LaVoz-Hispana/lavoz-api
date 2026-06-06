import moment from "moment";

const now = () => moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");

export const logEvent = (db, { escrowId, milestoneId = null, artifactId = null, actorId, actorRole, eventType, note = null }) => {
    const q = "INSERT INTO escrow_events (`escrowId`, `milestoneId`, `artifactId`, `actorId`, `actorRole`, `eventType`, `note`, `createdAt`) VALUES (?)";
    const values = [escrowId, milestoneId, artifactId, actorId, actorRole, eventType, note, now()];
    db.query(q, [values], (err) => {
        if (err) console.error(`[escrowLogger] Failed to log '${eventType}' for escrowId ${escrowId}:`, err);
    });
};
