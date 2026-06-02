import jwt from "jsonwebtoken";
import dotenv from "dotenv"

dotenv.config()

export const createTokens = (user) => {
    return jwt.sign(
        { id: user.id, username: user.username, account_type: user.account_type },
        process.env.JWT_SECRET
    );
};

export const optionalToken = () => (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const accessToken = (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null) || req.cookies["accessToken"];
    if (accessToken) {
        try {
            req.user = jwt.verify(accessToken, process.env.JWT_SECRET);
        } catch (_) {}
    }
    return next();
};

export const validateToken = (requiredRoles = []) => (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const accessToken = (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null) || req.cookies["accessToken"];
    if (!accessToken) return res.status(401).json({ error: "Not logged in!" });

    try {
        const userInfo = jwt.verify(accessToken, process.env.JWT_SECRET);
        req.user = userInfo;

        if (requiredRoles.length && !requiredRoles.includes(userInfo.account_type)) {
            return res.status(403).json({ error: "Forbidden" });
        }
        return next();
    } catch (err) {
        return res.status(403).json({ error: "Token is not valid!" });
    }
};
