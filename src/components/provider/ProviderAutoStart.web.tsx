// Streaming is mobile-only, so there is nothing to auto-resume on web/Electron.
export function ProviderAutoStart() {
  return null;
}
