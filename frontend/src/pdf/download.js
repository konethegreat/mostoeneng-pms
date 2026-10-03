// Generate a PDF from a react-pdf document element and trigger a download.
// Used on click (after any needed data fetch) so we don't render hidden links.
import { pdf } from "@react-pdf/renderer";

export async function downloadPdf(docElement, filename) {
  const blob = await pdf(docElement).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
