import { useCallback, useEffect, useState } from "react";

export type AsyncState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; error: Error };

export function useAsyncData<T>(
  load: () => Promise<T>,
  dependencies: readonly unknown[],
): AsyncState<T> & { reload: () => void } {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });

  useEffect(() => {
    let active = true;
    void load().then(
      (data) => {
        if (active) setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (!active) return;
        setState({
          status: "error",
          error: error instanceof Error ? error : new Error("Ukjent feil"),
        });
      },
    );
    return () => {
      active = false;
    };
    // Dependencies are supplied explicitly by each data-loading boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, reloadKey]);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);
  return { ...state, reload };
}
