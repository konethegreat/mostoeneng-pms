// Approved quarterly performance review report.
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { s, Header, Footer } from "./letterhead.jsx";

export default function ReviewReport({ review }) {
  const a = review.analytics || {};
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Header title="Performance Review" subtitle={review.cycle?.name} />

        <Text style={s.h2}>{review.subject?.name} — {review.subject?.title || "Attorney"}</Text>
        <View style={s.cell}>
          <Text style={s.muted}>Overall score</Text>
          <Text style={s.title}>{review.overallScore != null ? `${review.overallScore.toFixed(2)} / 5` : "—"}</Text>
        </View>
        <View style={s.cell}>
          <Text style={s.muted}>Manager</Text>
          <Text>{review.manager?.name || "—"}</Text>
        </View>
        <View style={s.cell}>
          <Text style={s.muted}>Approved</Text>
          <Text>{review.approvedAt ? new Date(review.approvedAt).toLocaleDateString() : "—"}</Text>
        </View>

        <Text style={s.h2}>Summary</Text>
        <Text style={s.para}>{review.finalSummary || "No summary recorded."}</Text>

        <Text style={s.h2}>Competency breakdown</Text>
        {(a.byCompetency || []).map((b) => (
          <View key={b.competencyId} style={s.cell}>
            <Text>{b.name}</Text>
            <Text>{b.average != null ? `${b.average.toFixed(1)} / 5` : "—"}</Text>
          </View>
        ))}
        {(!a.byCompetency || a.byCompetency.length === 0) && <Text style={s.muted}>No competency data.</Text>}

        <Footer />
      </Page>
    </Document>
  );
}
