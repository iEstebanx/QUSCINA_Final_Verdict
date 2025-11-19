// Backend/src/auth/requireAuth.js
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

function getTokenFromReq(req) {
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  return bearer || req.cookies?.qd_token || null;
}

function requireAuth(req, res, next) {
  const token = getTokenFromReq(req);

  if (!token) {
    console.log("[AUTH DEBUG] No token for", req.method, req.originalUrl);
    console.log("[AUTH DEBUG] Authorization header =", req.headers.authorization);
    console.log("[AUTH DEBUG] Cookies keys =", Object.keys(req.cookies || {}));
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    console.log("[AUTH DEBUG] Invalid token:", err.message);
    return res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = { requireAuth };