import { formatDuration } from "../format";
import { useT } from "../i18n";
import { useTimer } from "../timer";

/** The running rest timer, above the tab bar on every page. */
export function TimerBar() {
  const t = useT();
  const timer = useTimer();
  if (!timer.endsAt) return null;
  const progress = timer.total ? 1 - timer.remaining / timer.total : 1;

  return (
    <div className={`timer-bar${timer.done ? " done" : ""}`} role="timer" aria-live={timer.done ? "assertive" : "off"}>
      <div className="timer-progress" style={{ transform: `scaleX(${progress})` }} />
      <span className="timer-label">
        {timer.done ? t("restDone") : <>⏱ {t("rest")}</>}
        {timer.label && !timer.done && <span className="muted small"> · {timer.label}</span>}
      </span>
      {!timer.done && <strong className="timer-time">{formatDuration(timer.remaining)}</strong>}
      {!timer.done && (
        <>
          <button className="chip" onClick={() => timer.add(-15)}>
            −15
          </button>
          <button className="chip" onClick={() => timer.add(15)}>
            +15
          </button>
        </>
      )}
      <button className="chip" aria-label={t("stop")} onClick={timer.stop}>
        ✕
      </button>
    </div>
  );
}
