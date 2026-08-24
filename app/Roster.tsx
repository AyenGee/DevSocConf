"use client";

import { useEffect, useState } from "react";

type RosterData = {
  confirmedCount: number;
  checkedInCount: number;
  spotsTotal: number | null;
  attendees: { studentNumber: string; checkedIn: boolean }[];
};

export default function Roster() {
  const [data, setData] = useState<RosterData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  async function load() {
    try {
      const res = await fetch("/api/roster");
      const json = await res.json();
      setData(json);
    } catch {
      // Non-critical — next interval tick will retry.
    } finally {
      setLoading(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="card" style={{ marginTop: 24 }}>
        <p>Loading roster…</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="card" style={{ marginTop: 24, maxWidth: 460 }}>
      <div className="roster-summary">
        <div className="roster-stat">
          <div className="roster-stat__number">{data.checkedInCount}</div>
          <div className="roster-stat__label">In attendance</div>
        </div>
        <div className="roster-stat">
          <div className="roster-stat__number">{data.confirmedCount}</div>
          <div className="roster-stat__label">Confirmed</div>
        </div>
        {data.spotsTotal !== null && (
          <div className="roster-stat">
            <div className="roster-stat__number">{data.spotsTotal}</div>
            <div className="roster-stat__label">Total spots</div>
          </div>
        )}
      </div>

      <div className="roster-list">
        {data.attendees.length === 0 && (
          <p className="field-hint">No confirmed attendees yet.</p>
        )}
        {data.attendees.map((a) => (
          <div key={a.studentNumber} className="roster-item">
            <span className="roster-item__id">{a.studentNumber}</span>
            <span className={`roster-tag ${a.checkedIn ? "roster-tag--checked" : "roster-tag--pending"}`}>
              {a.checkedIn ? "✓ Scanned" : "Not yet"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
