"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.protect = protect;
const mongodb_1 = require("mongodb");
const index_1 = require("../index");
async function protect(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        let token;
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7);
        }
        else if (req.headers.cookie) {
            const cookies = req.headers.cookie.split(";").reduce((acc, c) => {
                const [key, val] = c.trim().split("=");
                if (key && val)
                    acc[key] = val;
                return acc;
            }, {});
            token = cookies["better-auth.session_token"];
        }
        if (!token) {
            res.status(401).json({ message: "Unauthorized: No token provided" });
            return;
        }
        const db = await (0, index_1.connectToDatabase)();
        // Better auth uses 'session' collection. 
        // It has a 'token' field that holds the session token.
        const session = await db.collection("session").findOne({ token });
        if (!session) {
            res.status(401).json({ message: "Unauthorized: Invalid session token" });
            return;
        }
        // Check expiration
        if (new Date(session.expiresAt) < new Date()) {
            res.status(401).json({ message: "Unauthorized: Session has expired" });
            return;
        }
        // Fetch the user. Convert userId string to ObjectId if necessary.
        const userIdObj = typeof session.userId === "string" ? new mongodb_1.ObjectId(session.userId) : session.userId;
        const user = await db.collection("user").findOne({ _id: userIdObj });
        if (!user) {
            res.status(401).json({ message: "Unauthorized: User not found" });
            return;
        }
        // Attach to request
        req.user = user;
        req.userId = user._id;
        next();
    }
    catch (error) {
        console.error("Auth middleware error:", error);
        res.status(500).json({ message: "Internal server error during authentication" });
    }
}
