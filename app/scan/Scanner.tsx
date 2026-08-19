"use client";

import { useEffect, useRef, useState } from "react";

type ScanResult = {
  result: "ADMIT" | "ALREADY_USED" | "INVALID";
  full_name: string | null;
  checked_in_at: string | null;
};

export default function Scanner() {
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [summary, setSummary] = useState<{ spots_total: number; checked_in_count: number } | null>(null);
  const [processing, setProcessing] = useState(false);
  const scannerRef = useRef<any>(null);
  const cooldownRef = useRef(false);

  useEffect(() => {
    // html5-qrcode reads the DOM directly and isn't SSR-safe, so it's
    // dynamically imported client-side only.
    let html5QrCode: any;

    import("html5-qrcode").then(({ Html5Qrcode }) => {
      html5QrCode = new Html5Qrcode("qr-reader");
      scannerRef.current = html5QrCode;

      html5QrCode
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          onScanSuccess,
          () => {} // ignore per-frame "no QR found" noise
        )
        .catch((err: unknown) => {
          console.error("Camera start failed:", err);
        });
    });

    refreshSummary();
    const interval = setInterval(refreshSummary, 8000);

    return () => {
      clearInterval(interval);
      scannerRef.current?.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshSummary() {
    try {
      const res = await fetch("/api/summary");
      const data = await res.json();
      setSummary(data);
    } catch {
      // Non-critical — the counter just won't update this tick.
    }
  }

  async function onScanSuccess(decodedText: string) {
    if (cooldownRef.current) return; // debounce rapid repeat reads of the same frame
    cooldownRef.current = true;
    setProcessing(true);

    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: decodedText, deviceNote: "web-scanner" }),
      });
      const data = await res.json();
      setLastResult(data);
      refreshSummary();
    } catch {
      setLastResult({ result: "INVALID", full_name: null, checked_in_at: null });
    } finally {
      setProcessing(false);
      // 2s cooldown so the same badge isn't scanned 10x while held in front of camera
      setTimeout(() => {
        cooldownRef.current = false;
      }, 2000);
    }
  }

  return (
    <div className="scanner-wrap">
      <div id="qr-reader" style={{ width: "100%" }} />

      {summary && (
        <p className="scanner-counter">
          {summary.checked_in_count} / {summary.spots_total} checked in
        </p>
      )}

      {processing && <p className="scanner-counter">Checking…</p>}

      {lastResult && !processing && (
        <div className={`scan-result ${lastResult.result === "ADMIT" ? "scan-result--admit" : "scan-result--reject"}`}>
          <p className="scan-result__label">
            {lastResult.result === "ADMIT" && "✅ Valid — Admit"}
            {lastResult.result === "ALREADY_USED" && "❌ Ticket Already Used"}
            {lastResult.result === "INVALID" && "❌ Invalid Ticket"}
          </p>
          {lastResult.full_name && <p className="scan-result__sub">{lastResult.full_name}</p>}
          {lastResult.result === "ALREADY_USED" && lastResult.checked_in_at && (
            <p className="scan-result__sub">
              First scanned: {new Date(lastResult.checked_in_at).toLocaleTimeString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
