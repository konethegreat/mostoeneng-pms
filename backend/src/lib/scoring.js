// Scoring & cadence analytics.
//
// Composite score = weighted average of every rating, where each rating is
// weighted by  competency.weight  ×  response.sourceWeight.
// This lets the firm say e.g. "Ethics matters more than Biz Dev" and
// "the manager's voice counts more than a single peer's".

export function computeOverallScore(responses) {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const resp of responses) {
    const sw = resp.sourceWeight ?? 1.0;
    for (const r of resp.ratings) {
      const w = (r.competency?.weight ?? 1.0) * sw;
      weightedSum += r.score * w;
      weightTotal += w;
    }
  }
  if (weightTotal === 0) return null;
  return Math.round((weightedSum / weightTotal) * 100) / 100;
}

// Per-competency averages across all submitted feedback (source-weighted),
// returned as an array suitable for a radar/bar chart.
export function competencyBreakdown(responses) {
  const acc = {}; // competencyId -> { name, category, weightedSum, weightTotal }
  for (const resp of responses) {
    const sw = resp.sourceWeight ?? 1.0;
    for (const r of resp.ratings) {
      const c = r.competency;
      if (!acc[c.id]) acc[c.id] = { competencyId: c.id, name: c.name, category: c.category, weightedSum: 0, weightTotal: 0 };
      acc[c.id].weightedSum += r.score * sw;
      acc[c.id].weightTotal += sw;
    }
  }
  return Object.values(acc).map((a) => ({
    competencyId: a.competencyId,
    name: a.name,
    category: a.category,
    average: a.weightTotal ? Math.round((a.weightedSum / a.weightTotal) * 100) / 100 : null,
  }));
}

// Average score grouped by the 360 source (SELF vs MANAGER vs PEER ...),
// so a manager can spot blind spots (e.g. self-rating >> peer rating).
export function bySourceBreakdown(requestsWithResponses) {
  const acc = {};
  for (const req of requestsWithResponses) {
    if (!req.response) continue;
    const role = req.reviewerRole;
    if (!acc[role]) acc[role] = { sum: 0, count: 0 };
    for (const r of req.response.ratings) {
      acc[role].sum += r.score;
      acc[role].count += 1;
    }
  }
  return Object.entries(acc).map(([role, v]) => ({
    source: role,
    average: v.count ? Math.round((v.sum / v.count) * 100) / 100 : null,
  }));
}

// Completion rate = submitted feedback requests / total requests.
export function completionRate(requests) {
  const total = requests.length;
  const submitted = requests.filter((r) => r.status === "SUBMITTED").length;
  return { total, submitted, pct: total ? Math.round((submitted / total) * 100) : 0 };
}

// Cycle time + SLA status, all measured from the launch timestamp.
export function cycleTime(review, slaDays) {
  if (!review.launchedAt) return { launched: false };
  const end = review.approvedAt ? new Date(review.approvedAt) : new Date();
  const launched = new Date(review.launchedAt);
  const elapsedDays = Math.floor((end - launched) / 86400000);
  const overdue = !review.approvedAt && elapsedDays > slaDays;
  return {
    launched: true,
    launchedAt: review.launchedAt,
    elapsedDays,
    slaDays,
    overdue,
    completed: !!review.approvedAt,
  };
}
