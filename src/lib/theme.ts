export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const KEY = "theme";
const listeners = new Set<() => void>();
const media = matchMedia("(prefers-color-scheme: dark)");

export function getPreference(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export function resolve(pref: ThemePref): ResolvedTheme {
  return pref === "dark" || (pref === "system" && media.matches) ? "dark" : "light";
}

export function applyTheme(pref: ThemePref) {
  localStorage.setItem(KEY, pref);
  document.documentElement.dataset.theme = resolve(pref);
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Con preferencia "system" se sigue el cambio del sistema operativo.
media.addEventListener("change", () => {
  if (getPreference() === "system") applyTheme("system");
});
