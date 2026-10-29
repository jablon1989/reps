import { createContext, useContext, type ReactNode } from "react";

export type Language = "en" | "pl";
export const LANGUAGES: Language[] = ["en", "pl"];

const en = {
  loading: "Loading…",
  tagline: "Our gym log: every set, every record.",
  logIn: "Log in",
  devWho: "Local test mode – who are you?",
  devAs: "Log in as {name}",
  logOut: "Log out",
  noAccessTitle: "No access to reps",
  noAccessText: "This login can't use reps yet. Ask Bartosz for an invite.",
  pageNotFound: "Page not found",
  tabWorkout: "Workout",
  tabExercises: "Exercises",
  tabStats: "Stats",
  tabSettings: "Settings",
  soonWorkout: "Logging sets comes in the next stage: pick an exercise, enter kg and reps, rest timer.",
  soonExercises: "The exercise list, grouped by body part, in English and Polish – plus your own exercises.",
  soonStats: "Records, graphs, volume per body part, calendar and streaks.",
  comingSoon: "Coming soon",
  language: "Language",
  account: "Account",
  friendNote: "You were invited to reps only.",
  adminTitle: "People",
  adminIntro: "Invite a friend: they get an e-mail with a temporary password and can use only reps.",
  inviteName: "Name",
  inviteEmail: "E-mail",
  inviteSend: "Send invite",
  inviteSending: "Sending…",
  inviteSent: "Invite sent to {email}.",
  inviteExisting: "{email} already has a pusiaczkowo.pl login – they can use reps now.",
  tagFriend: "friend",
  tagAdmin: "admin",
  tagInvited: "invited",
  tryAgain: "Try again",
  home: "Pusiaczkowo",
};

type Key = keyof typeof en;

const pl: Record<Key, string> = {
  loading: "Ładowanie…",
  tagline: "Nasz dziennik treningowy: każda seria, każdy rekord.",
  logIn: "Zaloguj się",
  devWho: "Tryb testowy – kim jesteś?",
  devAs: "Zaloguj jako {name}",
  logOut: "Wyloguj",
  noAccessTitle: "Brak dostępu do reps",
  noAccessText: "To konto nie ma jeszcze dostępu do reps. Poproś Bartosza o zaproszenie.",
  pageNotFound: "Nie ma takiej strony",
  tabWorkout: "Trening",
  tabExercises: "Ćwiczenia",
  tabStats: "Statystyki",
  tabSettings: "Ustawienia",
  soonWorkout: "Zapisywanie serii w następnym etapie: wybierz ćwiczenie, wpisz kg i powtórzenia, minutnik przerwy.",
  soonExercises: "Lista ćwiczeń pogrupowana według partii mięśni, po polsku i angielsku – plus Twoje własne.",
  soonStats: "Rekordy, wykresy, objętość na partię, kalendarz i serie dni.",
  comingSoon: "Już wkrótce",
  language: "Język",
  account: "Konto",
  friendNote: "Masz zaproszenie tylko do reps.",
  adminTitle: "Osoby",
  adminIntro: "Zaproś znajomego: dostanie e-mail z tymczasowym hasłem i będzie mieć dostęp tylko do reps.",
  inviteName: "Imię",
  inviteEmail: "E-mail",
  inviteSend: "Wyślij zaproszenie",
  inviteSending: "Wysyłanie…",
  inviteSent: "Zaproszenie wysłane na {email}.",
  inviteExisting: "{email} ma już konto na pusiaczkowo.pl – może już korzystać z reps.",
  tagFriend: "znajomy",
  tagAdmin: "admin",
  tagInvited: "zaproszony",
  tryAgain: "Spróbuj ponownie",
  home: "Pusiaczkowo",
};

export const DICTIONARIES: Record<Language, Record<Key, string>> = { en, pl };
export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", pl: "Polski" };

export type T = (key: Key, vars?: Record<string, string>) => string;

export function translator(language: Language): T {
  const dict = DICTIONARIES[language];
  return (key, vars) => dict[key].replace(/\{(\w+)\}/g, (_, name: string) => vars?.[name] ?? `{${name}}`);
}

/** Before login there are no settings yet: follow the browser. */
export function browserLanguage(): Language {
  return navigator.language?.toLowerCase().startsWith("pl") ? "pl" : "en";
}

const LanguageContext = createContext<Language>("en");

export function LanguageProvider({ language, children }: { language: Language; children: ReactNode }) {
  document.documentElement.lang = language;
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}

export function useT(): T {
  return translator(useContext(LanguageContext));
}
