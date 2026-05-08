const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const pool = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "changeme_in_production";

// 1.JWT middleware (for dashboard routes)
// Validates the Authorization: Bearer <token> header
exports.requireJWT = (req, res, next) => {
    const authHeader = req.headers["authorization"];
 
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            errorCode: "INVALID_API_KEY",
            message: "Authorization header missing or malformed"
        });
    }
 
    const token = authHeader.split(" ")[1];
 
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;  // { userId, email, plan }
        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            errorCode: "INVALID_API_KEY",
            message: "Token is invalid or expired"
        });
    }
};
 

// 2.Api Key middleware (for /api/v1/* routes)
// Validates X-API-Key header, attaches user + plan to req
exports.requireApiKey = async (req, res, next) => {
    const apiKey = req.headers["x-api-key"];
 
    if (!apiKey) {
        return res.status(401).json({
            success: false,
            errorCode: "INVALID_API_KEY",
            message: "X-API-Key header is required"
        });
    }
 
    try {
        // Look up key + join user to get plan
        const result = await pool.query(
            `SELECT ak.id, ak.api_key, ak.api_secret, ak.status,
                    u.id AS user_id, u.email, u.plan_type, u.status AS user_status
             FROM api_keys ak
             JOIN users u ON ak.user_id = u.id
             WHERE ak.api_key = $1`,
            [apiKey]
        );
 
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                errorCode: "INVALID_API_KEY",
                message: "Invalid API key"
            });
        }
 
        const keyRecord = result.rows[0];
 
        // Check key is active
        if (keyRecord.status === "revoked") {
            return res.status(401).json({
                success: false,
                errorCode: "INVALID_API_KEY",
                message: "This API key has been revoked"
            });
        }
 
        // Check user account is active
        if (keyRecord.user_status !== "active") {
            return res.status(403).json({
                success: false,
                errorCode: "ACCESS_DENIED",
                message: "Your account is not active"
            });
        }
 
        // Attach user info to request for downstream use
        req.user = {
            userId:   keyRecord.user_id,
            email:    keyRecord.email,
            plan:     keyRecord.plan_type,
            apiKeyId: keyRecord.id
        };
 
        // Update last_used timestamp (async, don't await — don't slow down the request)
        pool.query(
            "UPDATE api_keys SET last_used = NOW() WHERE id = $1",
            [keyRecord.id]
        );
 
        next();
 
    } catch (err) {
        console.error("requireApiKey error:", err.message);
        return res.status(500).json({
            success: false,
            errorCode: "INTERNAL_ERROR",
            message: "Auth check failed"
        });
    }
};