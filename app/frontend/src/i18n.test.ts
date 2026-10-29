import { describe, expect, it } from "vitest";
import { DICTIONARIES, translator } from "./i18n";

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
});
