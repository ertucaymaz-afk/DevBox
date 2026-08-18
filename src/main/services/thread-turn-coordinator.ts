export type ThreadQueueSnapshot = {
  threadId: string;
  queued: number;
  running: boolean;
};

type QueueState = {
  tail: Promise<void>;
  queued: number;
  running: boolean;
};

/**
 * Serializes turns inside one conversation while allowing different conversations
 * to execute in parallel. A deferred completion tail is installed in the map
 * before the operation is invoked, so synchronous failures and re-entrant queueing
 * cannot leave a stale record or bypass FIFO ordering.
 */
export class ThreadTurnCoordinator {
  readonly #queues = new Map<string, QueueState>();

  public snapshot(threadId: string): ThreadQueueSnapshot {
    const state = this.#queues.get(threadId);
    return { threadId, queued: state?.queued ?? 0, running: state?.running ?? false };
  }

  public snapshots(): ThreadQueueSnapshot[] {
    return [...this.#queues.entries()]
      .map(([threadId, state]) => ({ threadId, queued: state.queued, running: state.running }))
      .sort((left, right) => Number(right.running) - Number(left.running) || right.queued - left.queued || left.threadId.localeCompare(right.threadId));
  }

  public run<T>(threadId: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.#queues.get(threadId);
    const previousTail = existing?.tail ?? null;
    const state: QueueState = existing ?? { tail: Promise.resolve(), queued: 0, running: false };
    state.queued += 1;

    let settleTail!: () => void;
    const currentTail = new Promise<void>((resolve) => { settleTail = resolve; });
    state.tail = currentTail;
    this.#queues.set(threadId, state);

    const execute = async (): Promise<T> => {
      state.queued = Math.max(0, state.queued - 1);
      state.running = true;
      try {
        return await operation();
      } finally {
        state.running = false;
        const current = this.#queues.get(threadId);
        if (current === state && current.tail === currentTail && state.queued === 0) this.#queues.delete(threadId);
      }
    };

    const task = previousTail
      ? previousTail.catch(() => undefined).then(execute)
      : execute();
    void task.then(settleTail, settleTail);
    return task;
  }
}
