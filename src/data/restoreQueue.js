/** Bound passive layer initialization while retaining order and per-layer cancellation. */
export function createRestoreQueue(limit = 2) {
  let running = 0;
  const pending = [];
  function drain() {
    while (running < limit && pending.length) {
      const { task, signal, resolve, reject } = pending.shift();
      if (signal?.aborted) {
        reject(new DOMException('Layer restore superseded', 'AbortError'));
        continue;
      }
      running++;
      Promise.resolve().then(task).then(resolve, reject).finally(() => {
        running--;
        drain();
      });
    }
  }
  return (task, signal) => new Promise((resolve, reject) => {
    pending.push({task, signal, resolve, reject});
    drain();
  });
}
