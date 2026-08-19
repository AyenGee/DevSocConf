import ConfirmForm from "./ConfirmForm";
import { event } from "@/lib/brand";

export default function ConfirmPage({ params }: { params: { token: string } }) {
  return (
    <div className="page">
      <div className="header">
        <p className="header__eyebrow">{event.org}</p>
        <h1 className="header__title">{event.name}</h1>
        <p className="header__meta">{event.dateLabel}</p>
      </div>
      <div className="content">
        <ConfirmForm token={params.token} />
      </div>
    </div>
  );
}
