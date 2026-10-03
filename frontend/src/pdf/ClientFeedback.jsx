// Client feedback summary — a clean record of feedback a client submitted.
// `request` is the shape from GET /api/feedback/request/:id (competencies +
// existing ratings/strengths/improvements).
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { s, Header, Footer } from "./letterhead.jsx";

export default function ClientFeedback({ request }) {
  const existing = request.existing || {};
  const names = Object.fromEntries((request.competencies || []).map((c) => [c.id, c.name]));
  const ratings = existing.ratings || [];

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Header title="Client Feedback Summary" subtitle={request.cycle?.name} />

        <View style={s.cell}>
          <Text style={s.muted}>Attorney</Text>
          <Text style={s.title}>{request.subject?.name} — {request.subject?.title || ""}</Text>
        </View>

        <Text style={s.h2}>Ratings</Text>
        {ratings.map((r) => (
          <View key={r.competencyId} style={s.cell}>
            <Text>{names[r.competencyId] || "Competency"}</Text>
            <Text>{r.score} / 5</Text>
          </View>
        ))}
        {ratings.length === 0 && <Text style={s.muted}>No ratings submitted.</Text>}

        <Text style={s.h2}>Strengths</Text>
        <Text style={s.para}>{existing.strengths || "—"}</Text>

        <Text style={s.h2}>Areas to improve</Text>
        <Text style={s.para}>{existing.improvements || "—"}</Text>

        <Footer />
      </Page>
    </Document>
  );
}
