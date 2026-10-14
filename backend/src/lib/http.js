// Small request helpers shared by the review-workflow routes.

// Express 4 does not pass rejected promises to the error handler, so an
// unexpected database error would leave the request hanging. Route it instead.
export const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

export const LIMITS = { summary: 20000, feedback: 5000, comment: 1000, note: 1000, cycleName: 80 };

// Optional free text: null/undefined pass (callers decide what absence means);
// anything else must be a string within the limit. Returns an error message or null.
export function textProblem(value, field, max) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return `${field} must be text`;
  if (value.length > max) return `${field} must be ${max} characters or fewer`;
  return null;
}
