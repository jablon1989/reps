import { useMemo, useState } from "react";
import { useExercises } from "../exercises";
import { exerciseName } from "../format";
import { useLanguage, useT } from "../i18n";
import type { Exercise } from "../types";

/** Search + favourites + exercises grouped by body part (FitNotes-style). */
export function ExerciseList({ onPick, onEdit }: { onPick: (ex: Exercise) => void; onEdit?: (ex: Exercise) => void }) {
  const t = useT();
  const lang = useLanguage();
  const { categories, exercises, update } = useExercises();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      exercises
        .filter((e) => !e.hidden)
        .sort((a, b) => exerciseName(a, lang).localeCompare(exerciseName(b, lang), lang)),
    [exercises, lang],
  );
  const q = query.trim().toLowerCase();
  const matches = q ? visible.filter((e) => `${e.en} ${e.pl}`.toLowerCase().includes(q)) : [];
  const favourites = visible.filter((e) => e.favourite);

  const row = (ex: Exercise) => (
    <li key={ex.id} className="ex-row">
      <button className="ex-name" onClick={() => onPick(ex)}>
        <span>{exerciseName(ex, lang)}</span>
        {ex.custom && <span className="pill dim">{t("yours")}</span>}
      </button>
      {onEdit && ex.custom && (
        <button className="icon-btn" aria-label={t("editExercise")} onClick={() => onEdit(ex)}>
          ✎
        </button>
      )}
      <button
        className={`icon-btn star${ex.favourite ? " on" : ""}`}
        aria-label={t("star")}
        aria-pressed={ex.favourite}
        onClick={() => update(ex.id, { favourite: !ex.favourite })}
      >
        {ex.favourite ? "★" : "☆"}
      </button>
    </li>
  );

  return (
    <div className="ex-list">
      <input
        className="search"
        type="search"
        placeholder={t("search")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {q ? (
        matches.length ? (
          <ul className="card list">{matches.map(row)}</ul>
        ) : (
          <p className="muted">{t("noMatches")}</p>
        )
      ) : (
        <>
          {favourites.length > 0 && (
            <>
              <h2>★ {t("favourites")}</h2>
              <ul className="card list">{favourites.map(row)}</ul>
            </>
          )}
          <ul className="cats">
            {categories.map((c) => {
              const items = visible.filter((e) => e.category === c.id);
              const isOpen = open === c.id;
              return (
                <li key={c.id} className={`cat cat-${c.id}`}>
                  <button className="cat-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.id)}>
                    <span className="cat-dot" aria-hidden />
                    <span>{lang === "pl" ? c.pl : c.en}</span>
                    <span className="muted small">{items.length}</span>
                    <span className="chev" aria-hidden>
                      {isOpen ? "▾" : "▸"}
                    </span>
                  </button>
                  {isOpen && <ul className="list">{items.map(row)}</ul>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
