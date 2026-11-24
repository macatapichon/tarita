import { useEffect, useState } from "react";

/** Carga datos al montar y cada vez que cambian `deps`. `reload` fuerza una nueva carga. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    load().then(
      (value) => {
        if (active) {
          setData(value);
          setError(null);
        }
      },
      (e: unknown) => {
        if (active) setError(String(e));
      },
    );
    return () => {
      active = false;
    };
    // `load` se recrea en cada render; las dependencias reales son `deps` y `version`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  return { data, error, reload: () => setVersion((v) => v + 1) };
}
