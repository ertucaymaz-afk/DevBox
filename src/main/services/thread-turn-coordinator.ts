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
 * to execute in parallel. This prevents two provider calls from reading the same
 * stale thread history and then committing responses out of order.
 */
export class ThreadTurnCoordinator {
  readonly #queues = new Map<string, QueueState>();

  public snapshot(threadId: string): ThreadQueueSnapshot {
    const state = this.#queues.get(threadId);
    return { threadId, queued: state?.queued ?? 0, running: state?.running ?? false };
  }

  public async run<T>(threadId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#queues.get(threadId);
    const previousTail = previous?.tail ?? Promise.resolve();
    let release!: () => void;
    const currentDone = new Promise<void>((resolve) => { release = resolve; });
    const tail = previousTail.catch(() => undefined).then(() => currentDone);
    const state: QueueState = {
      tail,
      queued: (previous?.queued ?? 0) + 1,
      running: previous?.running ?? false
    };
    this.#queues.set(threadId, state);

    await previousTail.catch(() => undefined);
    const active = this.#queues.get(threadId);
    if (active) {
      active.queued = Math.max(0, active.queued - 1);
      active.running = true;
    }

    try {
      return await operation();
    } finally {
      const latest = this.#queues.get(threadId);
      if (latest) latest.running = false;
      release();
      if (this.#queues.get(threadId)?.tail === tail) this.#queues.delete(threadId);
    }
  }
}
