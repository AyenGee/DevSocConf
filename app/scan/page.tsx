import Scanner from "./Scanner";
import { event } from "@/lib/brand";

// No auth on this page by design (see spec) — it's an unlisted URL only
// shared with door staff for the day of the event.
export default function ScanPage() {
  return (
    <div className="page">import Scanner from "./Scanner";
import { event } from "@/lib/brand";

// No auth on this page by design (see spec) — it's an unlisted URL only
// shared with door staff for the day of the event.
export default function ScanPage() {
  return (
    <div className="page">
      <div className="header">
        <p className="header__eyebrow">{event.org} · Door Scanner</p>
        <h1 className="header__title">{event.name}</h1>
      </div>
      <div className="content">
        <Scanner />
      </div>
    </div>
  );
}

      <div className="header">
        <p className="header__eyebrow">{event.org} · Door Scanner</p>
        <h1 className="header__title">{event.name}</h1>
      </div>
      <div className="content">
        <Scanner />
      </div>
    </div>
  );
}
