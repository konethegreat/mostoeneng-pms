// Manager team snapshot — dashboard export for HR/partner meetings.
// `summary` + `rows` come from GET /api/dashboard/manager.
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { s, Header, Footer, COLORS } from "./letterhead.jsx";

export default function TeamSnapshot({ summary, rows }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Header title="Team Performance Snapshot" subtitle={new Date().toLocaleDateString()} />

        <View style={s.cell}><Text style={s.muted}>Reviews</Text><Text>{summary?.reviewCount ?? 0}</Text></View>
        <View style={s.cell}><Text style={s.muted}>Average score</Text><Text>{summary?.avgScore != null ? `${Number(summary.avgScore).toFixed(2)} / 5` : "—"}</Text></View>
        <View style={s.cell}><Text style={s.muted}>Completion</Text><Text>{summary?.completionPct ?? 0}%</Text></View>
        <View style={s.cell}><Text style={s.muted}>Overdue</Text><Text>{summary?.overdueCount ?? 0}</Text></View>
        <View style={s.cell}><Text style={s.muted}>Avg cycle time</Text><Text>{summary?.avgCycleDays != null ? `${summary.avgCycleDays} days` : "—"}</Text></View>

        <Text style={s.h2}>Reviews</Text>
        <View style={[s.row, { borderBottomWidth: 1, borderBottomColor: COLORS.brass, paddingBottom: 3 }]}>
          <Text style={[s.title, { width: "34%" }]}>Attorney</Text>
          <Text style={[s.title, { width: "24%" }]}>Cycle</Text>
          <Text style={[s.title, { width: "16%" }]}>Status</Text>
          <Text style={[s.title, { width: "13%", textAlign: "right" }]}>Score</Text>
          <Text style={[s.title, { width: "13%", textAlign: "right" }]}>Done</Text>
        </View>
        {(rows || []).map((r) => (
          <View key={r.reviewId} style={[s.row, { paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: COLORS.rule }]}>
            <Text style={{ width: "34%" }}>{r.subject}{r.overdue ? "  ⚠" : ""}</Text>
            <Text style={{ width: "24%" }}>{r.cycle}</Text>
            <Text style={{ width: "16%" }}>{r.status}</Text>
            <Text style={{ width: "13%", textAlign: "right" }}>{r.overallScore != null ? r.overallScore.toFixed(1) : "—"}</Text>
            <Text style={{ width: "13%", textAlign: "right" }}>{r.completionPct ?? 0}%</Text>
          </View>
        ))}
        {(!rows || rows.length === 0) && <Text style={s.muted}>No reviews.</Text>}

        <Footer />
      </Page>
    </Document>
  );
}
