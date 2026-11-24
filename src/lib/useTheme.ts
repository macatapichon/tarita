import { useCallback, useSyncExternalStore } from "react";
import { applyTheme, getPreference, resolve, subscribe, type ResolvedTheme, type ThemePref } from "./theme";

export function useTheme() {
  const preference = useSyncExternalStore(subscribe, getPreference);
  const resolved: ResolvedTheme = resolve(preference);
  const setPreference = useCallback((p: ThemePref) => applyTheme(p), []);
  return { preference, resolved, setPreference };
}
