// Shared "The Counsel" letterhead primitives for all PDF documents.
// Uses the built-in Times font (no font hosting) in the Counsel palette.

import { View, Text, StyleSheet } from "@react-pdf/renderer";

export const COLORS = {
  ink: "#1B2440",
  brass: "#B08D57",
  ivory: "#F6F2EA",
  rule: "#D8CDB8",
  muted: "#6b6357",
};

export const s = StyleSheet.create({
  page: { padding: 48, fontFamily: "Times-Roman", color: COLORS.ink, fontSize: 11, backgroundColor: "#ffffff" },
  brand: { fontSize: 18, fontFamily: "Times-Bold", color: COLORS.ink },
  brandSub: { fontSize: 8, letterSpacing: 2, color: COLORS.brass, marginTop: 2, textTransform: "uppercase" },
  rule: { borderBottomWidth: 1, borderBottomColor: COLORS.brass, marginVertical: 12 },
  h2: { fontSize: 13, fontFamily: "Times-Bold", marginTop: 14, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  cell: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.5, borderBottomColor: COLORS.rule, paddingVertical: 3 },
  muted: { color: COLORS.muted },
  para: { lineHeight: 1.5, marginBottom: 6 },
  right: { textAlign: "right" },
  title: { fontFamily: "Times-Bold" },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 8, color: COLORS.muted, textAlign: "center" },
});

export function Header({ title, subtitle }) {
  return (
    <View>
      <View style={s.row}>
        <View>
          <Text style={s.brand}>Demo Legal</Text>
          <Text style={s.brandSub}>Counsel · Performance</Text>
        </View>
        <View>
          <Text style={[s.title, s.right]}>{title}</Text>
          {subtitle ? <Text style={[s.muted, s.right]}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={s.rule} />
    </View>
  );
}

export function Footer() {
  return (
    <Text
      style={s.footer}
      render={({ pageNumber, totalPages }) => `Demo Legal PMS · Confidential · ${pageNumber}/${totalPages}`}
      fixed
    />
  );
}
