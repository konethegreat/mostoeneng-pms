import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.trim().length < 32) {
  throw new Error("JWT_SECRET must be configured with a random value of at least 32 characters");
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    SECRET,
    { algorithm: "HS256", expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
  );
}

// Verifies the Bearer token and attaches { id, role, email } to req.user
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = jwt.verify(token, SECRET, { algorithms: ["HS256"] });
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Role gate: requireRole("ADMIN", "MANAGER")
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden: insufficient role" });
    }
    next();
  };
}
