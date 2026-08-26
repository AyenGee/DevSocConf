"use client";

import { useEffect, useRef, useState } from "react";

type LoadState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; status: string; batch: string; spotsLeft: number | null }
  | { phase: "resolved-confirmed"; ticketId: string; fullName: string }
  | { phase: "resolved-declined" }
  | { phase: "resolved-expired" }
  | { phase: "full" }
  | { phase: "submitted-confirmed"; ticketId: string; fullName: string }
  | { phase: "submitted-declined" };

export default function ConfirmForm({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [fullName, setFullName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [witsEmail, setWitsEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/confirm?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setState({ phase: "error", message: data.error ?? "This link isn't valid." });
          return;
        }
        if (data.status === "CONFIRMED") {
          setState({ phase: "resolved-confirmed", ticketId: data.ticketId, fullName: data.fullName ?? "" });
          return;
        }
        if (data.status === "DECLINED") {
          setState({ phase: "resolved-declined" });
          return;
        }
        if (data.status === "EXPIRED") {
          setState({ phase: "resolved-expired" });
          return;
        }
        if (typeof data.spotsLeft === "number" && data.spotsLeft <= 0) {
          setState({ phase: "full" });
          return;
        }
        setState({ phase: "ready", status: data.status, batch: data.batch, spotsLeft: data.spotsLeft });
      })
      .catch(() => setState({ phase: "error", message: "Couldn't load this page. Please try again." }));
  }, [token]);

  async function submit(attending: boolean) {
    setFormError(null);

    if (attending) {
      if (!fullName.trim() || !studentNumber.trim() || !witsEmail.trim()) {
        setFormError("Please fill in your name, student number, and Wits email.");
        return;
      }
      if (!/@students\.wits\.ac\.za$/i.test(witsEmail.trim())) {
        setFormError("Please enter your Wits student email address.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmToken: token,
          fullName,
          studentNumber,
          witsEmail,
          attending,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      if (attending) {
        setState({ phase: "submitted-confirmed", ticketId: data.ticketId, fullName: data.fullName });
      } else {
        setState({ phase: "submitted-declined" });
      }
    } catch {
      setFormError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  if (state.phase === "loading") {
    return <div className="card"><p>Loading…</p></div>;
  }

  if (state.phase === "error") {
    return (
      <div className="card state-message">
        <div className="state-message__icon">⚠️</div>
        <h2 className="state-message__title">Link not valid</h2>
        <p className="state-message__body">{state.message}</p>
      </div>
    );
  }

  if (state.phase === "full") {
    return (
      <div className="card state-message">
        <div className="state-message__icon">🚫</div>
        <h2 className="state-message__title">Event is full</h2>
        <p className="state-message__body">
          Sorry — all spots for this event have been filled. Thanks for your interest, and
          keep an eye out for future Wits Developer Society events.
        </p>
      </div>
    );
  }

  if (state.phase === "resolved-declined" || state.phase === "submitted-declined") {
    return (
      <div className="card state-message">
        <div className="state-message__icon">👋</div>
        <h2 className="state-message__title">
          {state.phase === "submitted-declined" ? "Thanks for letting us know" : "You've already declined"}
        </h2>
        <p className="state-message__body">
          We've released your spot. Hope to see you at a future Wits Developer Society event.
        </p>
      </div>
    );
  }

  if (state.phase === "resolved-expired") {
    return (
      <div className="card state-message">
        <div className="state-message__icon">⏰</div>
        <h2 className="state-message__title">This invitation expired</h2>
        <p className="state-message__body">
          The 24-hour window to confirm has passed. Keep an eye out in case a later round opens up.
        </p>
      </div>
    );
  }

  if (state.phase === "resolved-confirmed" || state.phase === "submitted-confirmed") {
    return <TicketView ticketId={state.ticketId} fullName={state.fullName} justConfirmed={state.phase === "submitted-confirmed"} />;
  }

  // phase === "ready" — show the form
  return (
    <div className="card">
      {state.spotsLeft !== null && (
        <div className="spots-banner">
          {state.spotsLeft} spot{state.spotsLeft === 1 ? "" : "s"} remaining
        </div>
      )}

      {formError && <div className="error-text">{formError}</div>}

      <div className="field">
        <label htmlFor="fullName">Full name</label>
        <input
          id="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Jane Dlamini"
        />
      </div>

      <div className="field">
        <label htmlFor="studentNumber">Student number</label>
        <input
          id="studentNumber"
          value={studentNumber}
          onChange={(e) => setStudentNumber(e.target.value)}
          placeholder="123456"
        />
      </div>

      <div className="field">
        <label htmlFor="witsEmail">Wits student email</label>
        <input
          id="witsEmail"
          type="email"
          value={witsEmail}
          onChange={(e) => setWitsEmail(e.target.value)}
          placeholder=""
        />
        <p className="field-hint">
          Your ticket QR code will appear right here once you confirm — bookmark this exact
          page, since it's also how you'll pull your ticket back up on the day.
        </p>
      </div>

      <button className="btn-primary" disabled={submitting} onClick={() => submit(true)}>
        {submitting ? "Submitting…" : "Confirm My Attendance"}
      </button>
      <button className="btn-secondary" disabled={submitting} onClick={() => submit(false)}>
        I can't make it
      </button>
    </div>
  );
}

function TicketView({ ticketId, fullName, justConfirmed }: { ticketId: string; fullName: string; justConfirmed: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrReady, setQrReady] = useState(false);

  useEffect(() => {
    import("qrcode").then((QRCode) => {
      if (!canvasRef.current) return;
      QRCode.toCanvas(
        canvasRef.current,
        ticketId,
        { width: 220, margin: 2, color: { dark: "#0A1F44", light: "#FFFFFF" } },
        (err) => {
          if (!err) setQrReady(true);
        }
      );
    });
  }, [ticketId]);

  return (
    <div className="card state-message">
      <div className="state-message__icon">🎟️</div>
      <h2 className="state-message__title">
        {justConfirmed ? "You're confirmed!" : "You're confirmed"}
      </h2>
      {fullName && <p className="state-message__body" style={{ marginBottom: 4 }}>{fullName}</p>}
      <p className="state-message__body">
        29 August, 11:00–15:00 · Wits Main Campus, WSS4. This QR code is required for
        entry — you can always come back to this exact link to see it again.
      </p>
      <canvas ref={canvasRef} style={{ margin: "16px auto 0", display: qrReady ? "block" : "none" }} />
      <p style={{ fontFamily: "monospace", fontSize: 12, color: "var(--gray)", marginTop: 10 }}>
        {ticketId}
      </p>
    </div>
  );
}