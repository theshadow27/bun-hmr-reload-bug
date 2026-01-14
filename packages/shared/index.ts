// Shared module - imported by both server and client via workspace link
export const APP_NAME = "HMR Bug Repro";
export const VERSION = "1.0.0";

export function formatMessage(msg: string): string {
  return `[${APP_NAME}] ${msg}`;
}
