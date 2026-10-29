import type { Language } from "./i18n";

export interface Settings {
  language: Language;
}

export interface Me {
  name: string;
  email: string;
  admin: boolean;
  /** Invited to reps only. */
  friend: boolean;
  settings: Settings;
}

export interface Person {
  name: string;
  email: string;
  friend: boolean;
  admin: boolean;
  /** FORCE_CHANGE_PASSWORD = invited, hasn't logged in yet. */
  status: string;
  enabled: boolean;
}
