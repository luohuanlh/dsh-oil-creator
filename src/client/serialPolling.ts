// 一次只执行一个请求；停止后忽略尚未返回的结果与错误。
export function startSerialPolling<T>(options: {
  read: () => Promise<T>;
  onValue: (value: T) => void;
  onError: (cause: unknown) => void;
  intervalMs: number;
}): () => void {
  let stopped = false;
  let inFlight = false;
  const tick = async (): Promise<void> => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const value = await options.read();
      if (!stopped) options.onValue(value);
    } catch (cause) {
      if (!stopped) options.onError(cause);
    } finally {
      inFlight = false;
    }
  };
  const timer = globalThis.setInterval(() => { void tick(); }, options.intervalMs);
  return () => {
    stopped = true;
    globalThis.clearInterval(timer);
  };
}
