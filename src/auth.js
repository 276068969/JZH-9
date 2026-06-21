const crypto = require("crypto");

const sessions = new Map();
const SESSION_TTL = 1000 * 60 * 60 * 8;

function createSession(user) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, {
    userId: user.id,
    role: user.role,
    expiresAt: Date.now() + SESSION_TTL
  });
  return token;
}

function readCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)])
  );
}

function getSession(req) {
  const authHeader = req.headers.authorization || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const cookieToken = readCookies(req.headers.cookie || "").water_session;
  const token = bearer || cookieToken;
  const session = token ? sessions.get(token) : null;
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function destroySession(token) {
  sessions.delete(token);
}

module.exports = {
  createSession,
  getSession,
  destroySession
};
