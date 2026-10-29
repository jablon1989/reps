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
  today: "Today",
  yesterday: "Yesterday",
  prevDay: "Previous day",
  nextDay: "Next day",
  addExercise: "Add exercise",
  emptyDay: "Nothing logged this day yet.",
  pickExercise: "Pick an exercise",
  search: "Search exercises",
  favourites: "Favourites",
  noMatches: "No exercises match.",
  newExercise: "New exercise",
  editExercise: "Edit exercise",
  nameEn: "Name (English)",
  namePl: "Name (Polish)",
  nameHint: "One name is enough – it's used for both languages.",
  bodyPart: "Body part",
  type: "Type",
  typeWeight: "Weight + reps",
  typeBodyweight: "Bodyweight + reps",
  typeCardio: "Cardio (distance / time)",
  save: "Save",
  update: "Update",
  clear: "Clear",
  cancel: "Cancel",
  delete: "Delete",
  deleteExerciseConfirm: "Delete this exercise? Its logged sets stay.",
  yours: "yours",
  star: "Favourite",
  weightKg: "Weight (kg)",
  addedKg: "Added weight (kg, minus = assisted)",
  reps: "Reps",
  distanceKm: "Distance (km)",
  time: "Time (min or mm:ss)",
  setsToday: "Sets",
  lastTime: "Last time",
  noHistory: "First time on this exercise – have fun!",
  restTimer: "Rest timer",
  stepKg: "Step (kg)",
  seconds: "s",
  rest: "Rest",
  restDone: "Rest's over – next set!",
  stop: "Stop",
  invalidSet: "Enter the weight and reps.",
  invalidCardio: "Enter a distance or a time.",
  saved: "Saved",
  sets: "sets",
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
  today: "Dziś",
  yesterday: "Wczoraj",
  prevDay: "Poprzedni dzień",
  nextDay: "Następny dzień",
  addExercise: "Dodaj ćwiczenie",
  emptyDay: "Nic jeszcze nie zapisano tego dnia.",
  pickExercise: "Wybierz ćwiczenie",
  search: "Szukaj ćwiczeń",
  favourites: "Ulubione",
  noMatches: "Brak pasujących ćwiczeń.",
  newExercise: "Nowe ćwiczenie",
  editExercise: "Edytuj ćwiczenie",
  nameEn: "Nazwa (angielska)",
  namePl: "Nazwa (polska)",
  nameHint: "Wystarczy jedna nazwa – będzie użyta w obu językach.",
  bodyPart: "Partia mięśni",
  type: "Rodzaj",
  typeWeight: "Ciężar + powtórzenia",
  typeBodyweight: "Masa ciała + powtórzenia",
  typeCardio: "Cardio (dystans / czas)",
  save: "Zapisz",
  update: "Zmień",
  clear: "Wyczyść",
  cancel: "Anuluj",
  delete: "Usuń",
  deleteExerciseConfirm: "Usunąć to ćwiczenie? Zapisane serie zostaną.",
  yours: "własne",
  star: "Ulubione",
  weightKg: "Ciężar (kg)",
  addedKg: "Dodatkowy ciężar (kg, minus = odciążenie)",
  reps: "Powtórzenia",
  distanceKm: "Dystans (km)",
  time: "Czas (min lub mm:ss)",
  setsToday: "Serie",
  lastTime: "Ostatnio",
  noHistory: "Pierwszy raz to ćwiczenie – powodzenia!",
  restTimer: "Przerwa",
  stepKg: "Krok (kg)",
  seconds: "s",
  rest: "Przerwa",
  restDone: "Koniec przerwy – następna seria!",
  stop: "Stop",
  invalidSet: "Wpisz ciężar i powtórzenia.",
  invalidCardio: "Wpisz dystans lub czas.",
  saved: "Zapisano",
  sets: "serie",
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

export function useLanguage(): Language {
  return useContext(LanguageContext);
}

export function useT(): T {
  return translator(useContext(LanguageContext));
}
