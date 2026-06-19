import { db } from "../connect.js";
import moment from "moment";

export const sendNotification = (userTo, userFrom, type, objectId = null) => {
    if (userTo === userFrom) return;
    const q = "INSERT INTO notifications (`userTo`, `userFrom`, `type`, `createdAt`, `objectId`) VALUES (?)";
    const values = [userTo, userFrom, type, moment(Date.now()).format("YYYY-MM-DD HH:mm:ss"), objectId];
    db.query(q, [values], (err) => {
        if (err) console.error(`Error creating ${type} notification:`, err);
    });
};
