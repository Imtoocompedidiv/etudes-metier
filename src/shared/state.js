import { useEffect, useRef, useState } from "react";
const clone = (value) => structuredClone(value);
export function useHistory(initial, { key, max = 40, validate } = {}) {
  const seed = useRef(null);
  if (seed.current === null)
    seed.current = clone(typeof initial === "function" ? initial() : initial);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [history, setHistory] = useState(() => {
    let value = clone(seed.current);
    if (key)
      try {
        const saved = JSON.parse(
          localStorage.getItem(`jd-study:${key}`) || "null",
        );
        if (
          saved?.version === 1 &&
          saved.value != null &&
          (!validate || validate(saved.value))
        )
          value = saved.value;
      } catch {
        /* A corrupt or inaccessible local cache never blocks the example. */
      }
    return { past: [], value, future: [] };
  });
  useEffect(() => {
    if (!key) return;
    try {
      localStorage.setItem(
        `jd-study:${key}`,
        JSON.stringify({ version: 1, value: history.value }),
      );
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  }, [history.value, key]);
  const set = (next) =>
    setHistory((previous) => {
      const value =
        typeof next === "function" ? next(clone(previous.value)) : next;
      if (JSON.stringify(value) === JSON.stringify(previous.value))
        return previous;
      return {
        past: [...previous.past, previous.value].slice(-max),
        value: clone(value),
        future: [],
      };
    });
  const undo = () =>
    setHistory((h) =>
      h.past.length
        ? {
            past: h.past.slice(0, -1),
            value: h.past.at(-1),
            future: [h.value, ...h.future].slice(0, max),
          }
        : h,
    );
  const redo = () =>
    setHistory((h) =>
      h.future.length
        ? {
            past: [...h.past, h.value].slice(-max),
            value: h.future[0],
            future: h.future.slice(1),
          }
        : h,
    );
  const reset = () => set(clone(seed.current));
  return {
    ...history,
    set,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    reset,
    storageAvailable,
  };
}
