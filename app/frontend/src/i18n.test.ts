import { describe, expect, it } from "vitest";
import { DICTIONARIES, changesText, translator } from "./i18n";

describe("i18n", () => {
  it("has every text in English and Polish", () => {
    const en = Object.keys(DICTIONARIES.en).sort();
    expect(Object.keys(DICTIONARIES.pl).sort()).toEqual(en);
    for (const dict of Object.values(DICTIONARIES)) {
      for (const text of Object.values(dict)) expect(text.trim()).not.toBe("");
    }
  });

  it("fills in names", () => {
    expect(translator("pl")("devAs", { name: "Asiulka" })).toBe("Zaloguj jako Asiulka");
    expect(translator("en")("inviteSent", { email: "a@b.pl" })).toBe("Invite sent to a@b.pl.");
  });

  it("counts changes in both languages", () => {
    expect(changesText(1, "en")).toBe("1 change");
    expect(changesText(3, "en")).toBe("3 changes");
    expect(["1", "2", "5", "12", "22", "25"].map((n) => changesText(Number(n), "pl"))).toEqual([
      "1 zmiana",
      "2 zmiany",
      "5 zmian",
      "12 zmian",
      "22 zmiany",
      "25 zmian",
    ]);
  });
});
