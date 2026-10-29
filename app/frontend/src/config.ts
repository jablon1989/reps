export interface AppConfig {
  region?: string;
  authority?: string;
  clientId?: string;
  cognitoDomain?: string;
  /** Local fake backend (`make local`): no Cognito, pick a player instead. */
  dev?: { players: string[] };
}

// Written by Terraform to the website bucket (and by `make dev-config` / `make local` locally).
export async function loadConfig(): Promise<AppConfig> {
  const res = await fetch("/config.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load /config.json (${res.status})`);
  return res.json();
}
