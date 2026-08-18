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
 * to execute in parallel. The first turn of an idle thread starts immediately;
 * only later turns pay the queue wait, avoiding an unnecessary microtask delay.
 */
export class ThreadTurnCoordinator {
  readonly #queues = new Map<string, QueueState>();

  public snapshot(threadId: string): ThreadQueueSnapshot {
    const state = this.#queues.get(threadId);
    return { threadId, queued: state?.queued ?? 0, running: state?.running ?? false };
  }

  public run<T>(threadId: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.#queues.get(threadId);
    const state: QueueState = existing ?? { tail: Promise.resolve(), queued: 0, running: false };
    state.queued += 1;

    let task!: Promise<T>;
    let tail!: Promise<void>;
    const execute = async (): Promise<T> => {
      state.queued = Math.max(0, state.queued - 1);
      state.running = true;
      try {
        return await operation();
      } finally {
        state.running = false;
        if (this.#queues.get(threadId)?.tail === tail) this.#queues.delete(threadId);
      }
    };

    task = existing
      ? existing.tail.catch(() => undefined).then(execute)
      : execute();
    tail = task.then(() => undefined, () => undefined);
    state.tail = tail;
    this.#queues.set(threadId, state);
    return task;
  }
}
