import { homedir, platform } from "node:os";
import { join } from "node:path";

export function defaultDataDirectory(): string {
  if (process.env.DAILY_CHIEF_HOME) return process.env.DAILY_CHIEF_HOME;
  if (platform() === "win32") return join(process.env.LOCALAPPDATA ?? homedir(), "BanpieDailyChief");
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", "BanpieDailyChief");
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "banpie-daily-chief");
}

export function defaultDatabasePath(): string {
  return join(defaultDataDirectory(), "daily-chief.sqlite");
}

