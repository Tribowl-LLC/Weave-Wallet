import type { ActivityEntry } from "@/store/activity";

// Export helpers for the Activity screen. We keep these in a dedicated
// file (rather than inline on the page) so they can be unit-tested
// without React and reused if Settings ever grows a "Export everything"
// shortcut.

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // Some browsers require the anchor to be in the DOM before .click()
  // for the download attribute to be respected.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportActivityAsJson(entries: ActivityEntry[]): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    entryCount: entries.length,
    entries,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadBlob(blob, `weavewallet-activity-${timestamp()}.json`);
}

const CSV_HEADERS = [
  "id", "createdAt", "settledAt", "status", "asset", "amount", "amountUsd",
  "description", "lightningInvoice", "lightningPaymentHash",
  "lightningStatus", "lightningError", "fiberTxHash", "preimage",
  "errorCode", "errorMessage",
] as const;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  // CSV formula-injection guard: spreadsheets (Excel, Google Sheets,
  // LibreOffice) treat cells starting with `=`, `+`, `-`, `@`, tab, or
  // CR as formulas. A memo of "=cmd|' /c calc'!A1" can RCE on open.
  // Prefix any such cell with a single-quote so the cell renders as
  // literal text. The leading quote is stripped on display by Excel.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  // Quote whenever the value contains a comma, quote, newline, or
  // leading/trailing whitespace — and double-up any embedded quotes.
  if (/[",\r\n]/.test(str) || /^\s|\s$/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportActivityAsCsv(entries: ActivityEntry[]): void {
  const rows = [CSV_HEADERS.join(",")];
  for (const e of entries) {
    rows.push(CSV_HEADERS.map(h => {
      const v = (e as any)[h];
      if (h === "createdAt" || h === "settledAt") {
        return v ? csvEscape(new Date(v).toISOString()) : "";
      }
      return csvEscape(v);
    }).join(","));
  }
  // BOM so Excel detects UTF-8 correctly for memos that contain emoji
  // or non-ASCII text.
  const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `weavewallet-activity-${timestamp()}.csv`);
}
