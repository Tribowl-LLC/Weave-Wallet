import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface Props {
  value: string;
  size?: number;
  /** Tailwind class for the QR foreground color. Defaults to white-on-transparent. */
  className?: string;
  ariaLabel?: string;
}

// Lightweight QR renderer. We use `qrcode`'s `toString` SVG output so the
// result is crisp at any size, has no canvas/DOM dependency, and inherits
// the surrounding color via currentColor. Generation is async because the
// library does the encoding off the render path.
export default function QRDisplay({ value, size = 220, className = "text-foreground", ariaLabel }: Props) {
  const [svg, setSvg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setSvg(null);
      return;
    }
    QRCode.toString(value, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      // Foreground = currentColor (`text-…`); background = transparent so
      // the surrounding card color shows through.
      color: { dark: "#ffffff", light: "#00000000" },
    })
      .then(s => {
        if (cancelled) return;
        // Rewrite the hard-coded #ffffff to currentColor so Tailwind text
        // classes drive the QR color.
        setSvg(s.replace(/#ffffff/gi, "currentColor"));
        setErr(null);
      })
      .catch(e => {
        if (cancelled) return;
        setErr(e?.message || "Failed to render QR");
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (err) {
    return (
      <div
        className={`flex items-center justify-center bg-muted/30 border border-border/40 rounded-2xl ${className}`}
        style={{ width: size, height: size }}
      >
        <span className="text-xs text-destructive p-3 text-center">{err}</span>
      </div>
    );
  }

  if (!svg) {
    return (
      <div
        className={`bg-muted/20 border border-border/40 rounded-2xl animate-pulse ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={ariaLabel || `QR code for ${value.slice(0, 12)}…`}
      className={`bg-white p-3 rounded-2xl shadow-sm ${className}`}
      style={{ width: size, height: size, color: "#000000" }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
