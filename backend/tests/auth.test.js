import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";

const secret = randomBytes(32).toString("hex");
process.env.JWT_SECRET = secret;
const { signToken, requireAuth, requireRole } = await import("../src/middleware/auth.js");
const user = { id: "synthetic-user", role: "MANAGER", email: "manager@example.test" };

function authenticate(token) {
  const req = { headers: token === undefined ? {} : { authorization: `Bearer ${token}` } };
  const res = {
    statusCode: 200,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
  let passed = false;
  requireAuth(req, res, () => { passed = true; });
  return { req, res, passed };
}

for (const value of ["", "short", "dev-secret-change-me", " ".repeat(64)]) {
  test(`startup rejects an unsafe signing configuration of length ${value.length}`, () => {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e",
      "await import('./src/middleware/auth.js')"], {
      env: { ...process.env, JWT_SECRET: value }, encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /JWT_SECRET must be configured/);
  });
}

test("tokens round-trip with an expiry and HS256", () => {
  const token = signToken(user);
  const { req, passed } = authenticate(token);
  assert.equal(passed, true);
  assert.deepEqual(req.user, user);
  const decoded = jwt.decode(token, { complete: true });
  assert.equal(decoded.header.alg, "HS256");
  assert.ok(decoded.payload.exp > decoded.payload.iat);
});

for (const [name, makeToken] of [
  ["missing", () => undefined],
  ["malformed", () => "malformed"],
  ["wrong key", () => jwt.sign(user, randomBytes(32).toString("hex"))],
  ["expired", () => jwt.sign({ sub: user.id }, secret, { expiresIn: -1 })],
  ["HS384", () => jwt.sign({ sub: user.id }, secret, { algorithm: "HS384" })],
  ["unsigned", () => jwt.sign({ sub: user.id }, "", { algorithm: "none" })],
]) {
  test(`authentication rejects ${name} tokens`, () => {
    const { req, res, passed } = authenticate(makeToken());
    assert.equal(passed, false);
    assert.equal(res.statusCode, 401);
    assert.equal(req.user, undefined);
  });
}

test("role gates allow the configured role and reject other roles", () => {
  const { req, res } = authenticate(signToken(user));
  let passed = false;
  requireRole("MANAGER")(req, res, () => { passed = true; });
  assert.equal(passed, true);
  requireRole("ADMIN")(req, res, () => assert.fail("role gate was bypassed"));
  assert.equal(res.statusCode, 403);
});
