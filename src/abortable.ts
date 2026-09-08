/** Stop waiting immediately on cancellation; always observe the underlying promise. */
export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new Error("Import abgebrochen oder Zeitlimit erreicht."));
    if (signal.aborted) { promise.catch(() => {}); cancel(); return; }
    signal.addEventListener("abort", cancel, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", cancel));
  });
}
