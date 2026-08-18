import { describe, expect, it } from "vitest";
import { ThreadTurnCoordinator } from "./thread-turn-coordinator.js";

const deferred = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
};

describe("ThreadTurnCoordinator", () => {
  it("runs turns FIFO inside one thread", async () => {
    const coordinator = new ThreadTurnCoordinator();
    const firstGate = deferred();
    const order: string[] = [];
    const first = coordinator.run("thread-a", async () => {
      order.push("first:start");
      await firstGate.promise;
      order.push("first:end");
      return 1;
    });
    const second = coordinator.run("thread-a", async () => {
      order.push("second:start");
      order.push("second:end");
      return 2;
    });

    await Promise.resolve();
    expect(order).toEqual(["first:start"]);
    expect(coordinator.snapshot("thread-a")).toMatchObject({ running: true, queued: 1 });
    firstGate.release();
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(order).toEqual(["first:start", "first:end", "second:start", "second:end"]);
    expect(coordinator.snapshot("thread-a")).toEqual({ threadId: "thread-a", running: false, queued: 0 });
  });

  it("allows different threads to execute concurrently", async () => {
    const coordinator = new ThreadTurnCoordinator();
    const gate = deferred();
    const started: string[] = [];
    const a = coordinator.run("thread-a", async () => { started.push("a"); await gate.promise; });
    const b = coordinator.run("thread-b", async () => { started.push("b"); await gate.promise; });
    await Promise.resolve();
    expect(new Set(started)).toEqual(new Set(["a", "b"]));
    gate.release();
    await Promise.all([a, b]);
  });

  it("continues the queue after a failed turn", async () => {
    const coordinator = new ThreadTurnCoordinator();
    const order: string[] = [];
    const failed = coordinator.run("thread-a", async () => { order.push("failed"); throw new Error("boom"); });
    const next = coordinator.run("thread-a", async () => { order.push("next"); return "ok"; });
    await expect(failed).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
    expect(order).toEqual(["failed", "next"]);
  });

  it("removes queue state after an operation throws before its first await", async () => {
    const coordinator = new ThreadTurnCoordinator();
    const failed = coordinator.run("thread-sync", async () => {
      throw new Error("sync-before-await");
    });
    await expect(failed).rejects.toThrow("sync-before-await");
    expect(coordinator.snapshot("thread-sync")).toEqual({ threadId: "thread-sync", queued: 0, running: false });
    expect(coordinator.snapshots().some((item) => item.threadId === "thread-sync")).toBe(false);
  });

  it("installs the current completion tail before re-entrant same-thread queueing", async () => {
    const coordinator = new ThreadTurnCoordinator();
    const order: string[] = [];
    let nested!: Promise<string>;
    const outer = coordinator.run("thread-reentrant", async () => {
      order.push("outer:start");
      nested = coordinator.run("thread-reentrant", async () => {
        order.push("nested:start");
        return "nested";
      });
      order.push("outer:end");
      return "outer";
    });

    await expect(outer).resolves.toBe("outer");
    await expect(nested).resolves.toBe("nested");
    expect(order).toEqual(["outer:start", "outer:end", "nested:start"]);
    expect(coordinator.snapshot("thread-reentrant")).toEqual({ threadId: "thread-reentrant", queued: 0, running: false });
  });
});
