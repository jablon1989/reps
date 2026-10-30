import { useT } from "../i18n";
import { useMe } from "../me";
import { PERSON_COLORS } from "../shared";

/** Pick the colour your stats are drawn in on the "us" page. */
export function ColorPicker() {
  const t = useT();
  const { me, setColor } = useMe();
  const current = me.settings.color;
  return (
    <div className="color-picker">
      <span className="small muted">{t("yourColor")}</span>
      <div className="swatches" role="radiogroup" aria-label={t("yourColor")}>
        {PERSON_COLORS.map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={current === c}
            aria-label={t(`color_${c}`)}
            title={t(`color_${c}`)}
            className={`swatch pc-${c}${current === c ? " on" : ""}`}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
    </div>
  );
}
