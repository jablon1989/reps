import { useT } from "../i18n";

export function ComingSoon({ icon, title, text }: { icon: string; title: string; text: string }) {
  const t = useT();
  return (
    <section className="page">
      <h1>{title}</h1>
      <div className="card soon">
        <span className="soon-icon" aria-hidden>
          {icon}
        </span>
        <span className="pill">{t("comingSoon")}</span>
        <p className="muted">{text}</p>
      </div>
    </section>
  );
}
