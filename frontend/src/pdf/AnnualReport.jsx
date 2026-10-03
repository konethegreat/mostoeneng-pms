// Annual rollup report — aggregates approved quarterly reports for one attorney.
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { s, Header, Footer } from "./letterhead.jsx";

export default function AnnualReport({ rollup, attorneyName }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Header title="Annual Performance Rollup" subtitle={rollup.annualCycle} />

        {attorneyName ? <Text style={s.h2}>{attorneyName}</Text> : null}
        <View style={s.cell}>
          <Text style={s.muted}>Annual score</Text>
          <Text style={s.title}>{rollup.annualScore != null ? `${rollup.annualScore.toFixed(2)} / 5` : "—"}</Text>
        </View>
        <View style={s.cell}>
          <Text style={s.muted}>Quarters complete</Text>
          <Text>{rollup.quartersComplete} / {rollup.quartersTotal}</Text>
        </View>

        <Text style={s.h2}>Quarterly summaries</Text>
        {(rollup.quarters || []).map((q, i) => (
          <View key={i} wrap={false}>
            <View style={s.cell}>
              <Text style={s.title}>{q.cycle}</Text>
              <Text>{q.score != null ? `${q.score.toFixed(2)} / 5` : "—"}</Text>
            </View>
            <Text style={s.para}>{q.summary || "No summary recorded."}</Text>
          </View>
        ))}
        {(!rollup.quarters || rollup.quarters.length === 0) && (
          <Text style={s.muted}>No approved quarters yet.</Text>
        )}

        <Footer />
      </Page>
    </Document>
  );
}
