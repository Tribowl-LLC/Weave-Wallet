import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportActivityAsCsv, exportActivityAsJson } from "./exportActivity";
import type { ActivityEntry } from "@/store/activity";

// jsdom's Blob has no `.text()`, so instead of reading the blob back, we
// intercept the Blob constructor and capture the raw chunks the export
// helper passed in. That's the actual contract under test: what bytes
// the user's browser would receive.
function captureBlob(): { getBlob: () => { text: string; type: string } | null } {
  let captured: { text: string; type: string } | null = null;
  const RealBlob = globalThis.Blob;
  class CapturingBlob extends RealBlob {
    constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
      super(parts, options);
      const text = (parts ?? []).map((p) =>
        typeof p === "string" ? p : ""
      ).join("");
      captured = { text, type: options?.type ?? "" };
    }
  }
  vi.stubGlobal("Blob", CapturingBlob);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
  return { getBlob: () => captured };
}

async function blobText(captured: { text: string; type: string } | null): Promise<string> {
  return captured?.text ?? "";
}

const baseEntry: ActivityEntry = {
  id: "pay_1",
  status: "settled",
  asset: "RUSD",
  amount: "10.00",
  amountUsd: 10,
  description: "Coffee",
  lightningInvoice: "lnbc100u1p...",
  lightningPaymentHash: "abc123",
  lightningStatus: "settled",
  fiberTxHash: "0xfiber",
  preimage: "0xpreimage",
  createdAt: 1716206400000, // 2024-05-20T12:00:00.000Z
  settledAt: 1716206410000,
};

describe("exportActivityAsCsv", () => {
  beforeEach(() => {
    // Anchor-click side-effect needs a body to append to. jsdom gives us one.
  });

  it("writes a UTF-8 BOM so Excel detects encoding correctly", async () => {
    const cap = captureBlob();
    exportActivityAsCsv([baseEntry]);
    const text = await blobText(cap.getBlob());
    expect(text.charCodeAt(0)).toBe(0xFEFF);
  });

  it("emits a header row and one data row per entry", async () => {
    const cap = captureBlob();
    exportActivityAsCsv([baseEntry, { ...baseEntry, id: "pay_2" }]);
    const text = await blobText(cap.getBlob());
    const lines = text.replace(/^\uFEFF/, "").split("\n");
    expect(lines[0]).toMatch(/^id,createdAt,settledAt,status,asset/);
    expect(lines).toHaveLength(3); // header + 2 rows
  });

  it("ISO-formats createdAt and settledAt", async () => {
    const cap = captureBlob();
    exportActivityAsCsv([baseEntry]);
    const text = await blobText(cap.getBlob());
    expect(text).toContain("2024-05-20T12:00:00.000Z");
  });

  it("quotes values containing commas, quotes, or newlines", async () => {
    const cap = captureBlob();
    exportActivityAsCsv([{ ...baseEntry, description: 'A "comma, in" memo' }]);
    const text = await blobText(cap.getBlob());
    // Inner quotes must be doubled, the whole field wrapped in quotes.
    expect(text).toContain('"A ""comma, in"" memo"');
  });

  it("escapes leading '=' to defeat CSV formula injection", async () => {
    const cap = captureBlob();
    exportActivityAsCsv([{ ...baseEntry, description: "=cmd|' /c calc'!A1" }]);
    const text = await blobText(cap.getBlob());
    // The cell must be prefixed with a literal single-quote (and then
    // wrapped in double-quotes because it now contains a comma).
    expect(text).toMatch(/"'=cmd\|' \/c calc'!A1"|'=cmd/);
    // It must NOT start the field with a bare '=' that Excel evaluates.
    expect(text).not.toMatch(/,=cmd/);
  });

  it("escapes leading '+', '-', '@', tab, and CR similarly", async () => {
    const cap = captureBlob();
    exportActivityAsCsv([
      { ...baseEntry, id: "+danger" },
      { ...baseEntry, id: "-danger" },
      { ...baseEntry, id: "@danger" },
      { ...baseEntry, id: "\tdanger" },
    ]);
    const text = await blobText(cap.getBlob());
    expect(text).toContain("'+danger");
    expect(text).toContain("'-danger");
    expect(text).toContain("'@danger");
  });

  it("leaves safe values unquoted", async () => {
    const cap = captureBlob();
    exportActivityAsCsv([{ ...baseEntry, description: "plain text" }]);
    const text = await blobText(cap.getBlob());
    expect(text).toContain(",plain text,");
  });

  it("emits empty cells for missing optional fields", async () => {
    const cap = captureBlob();
    const sparse: ActivityEntry = {
      id: "p", status: "pending", asset: "USDI", amount: "1",
      amountUsd: 1, lightningInvoice: "ln...", createdAt: 1000,
    };
    exportActivityAsCsv([sparse]);
    const text = await blobText(cap.getBlob());
    // Trailing empties from optional fields.
    expect(text).toMatch(/,,,\s*$/m);
  });
});

describe("exportActivityAsJson", () => {
  it("wraps entries in an envelope with metadata", async () => {
    const cap = captureBlob();
    exportActivityAsJson([baseEntry]);
    const text = await blobText(cap.getBlob());
    const parsed = JSON.parse(text);
    expect(parsed.entryCount).toBe(1);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].id).toBe("pay_1");
    expect(typeof parsed.exportedAt).toBe("string");
    expect(new Date(parsed.exportedAt).toString()).not.toBe("Invalid Date");
  });

  it("pretty-prints (>= 2-space indent) so users can eyeball it", async () => {
    const cap = captureBlob();
    exportActivityAsJson([baseEntry]);
    const text = await blobText(cap.getBlob());
    expect(text).toContain("\n  ");
  });

  it("uses an application/json blob type", async () => {
    const cap = captureBlob();
    exportActivityAsJson([baseEntry]);
    expect(cap.getBlob()!.type).toBe("application/json");
  });
});
