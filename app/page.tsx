import Link from "next/link";
import { event } from "@/lib/brand";
import Roster from "./Roster";

export default function HomePage() {
  return (
    <div className="page">
      <div className="header">
        <p className="header__eyebrow">{event.org}</p>
        <h1 className="header__title">{event.name}</h1>
        <p className="header__meta">{event.dateLabel}</p>
      </div>
      <div className="content">
        <div style={{ width: "100%", maxWidth: 460 }}>
          <div className="card state-message">
            <p className="state-message__body">
              This site handles RSVP confirmations and entry ticketing for {event.name}.
              If you received an invitation email, use the confirmation link from that email —
              this page itself isn't a registration form.
            </p>
            <Link href="/scan" className="btn-secondary" style={{ display: "block", textDecoration: "none", textAlign: "center", marginTop: 20 }}>
              Open door scanner
            </Link>
          </div>
          <Roster />
        </div>
      </div>
    </div>
  );
}
