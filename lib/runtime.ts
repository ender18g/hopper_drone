import type { DroneEventName } from "./drone";

type AsyncHandler = () => void | Promise<void>;
type ActiveBlockHandler = (blockId: string | null) => void;

export class ExecutionRuntime {
  stopped = false;
  hasEvents = false;

  private pressedKeys = new Set<string>();
  private cleanupCallbacks: Array<() => void> = [];
  private activeBlocks: Array<{ token: symbol; blockId: string }> = [];
  private pendingTasks = new Set<Promise<unknown>>();
  private idleResolvers = new Set<() => void>();
  private stopResolver: (() => void) | null = null;
  private readonly eventWindows: Window[];
  private stopPromise = new Promise<void>((resolve) => {
    this.stopResolver = resolve;
  });

  constructor(
    private readonly onError: (error: unknown) => void,
    private readonly onStop: () => void,
    private readonly onActiveBlock: ActiveBlockHandler = () => undefined,
    private readonly timingWindow: Window = window,
  ) {
    this.eventWindows = this.timingWindow === window
      ? [window]
      : [window, this.timingWindow];
    const keyDown = (event: KeyboardEvent) => this.pressedKeys.add(this.normalizeKey(event.key));
    const keyUp = (event: KeyboardEvent) => this.pressedKeys.delete(this.normalizeKey(event.key));
    this.eventWindows.forEach((eventWindow) => {
      eventWindow.addEventListener("keydown", keyDown);
      eventWindow.addEventListener("keyup", keyUp);
      this.cleanupCallbacks.push(() => eventWindow.removeEventListener("keydown", keyDown));
      this.cleanupCallbacks.push(() => eventWindow.removeEventListener("keyup", keyUp));
    });
  }

  registerKey(kind: "pressed" | "released", key: string, handler: AsyncHandler) {
    this.hasEvents = true;
    const eventName = kind === "pressed" ? "keydown" : "keyup";
    const listener = (event: KeyboardEvent) => {
      if (this.normalizeKey(event.key) === key && !this.stopped) {
        void this.trackTask(Promise.resolve().then(handler)).catch(this.onError);
      }
    };
    this.eventWindows.forEach((eventWindow) => {
      eventWindow.addEventListener(eventName, listener);
      this.cleanupCallbacks.push(() => eventWindow.removeEventListener(eventName, listener));
    });
  }

  registerDrone(eventName: DroneEventName, handler: AsyncHandler) {
    this.hasEvents = true;
    const listener = (event: Event) => {
      const droneEvent = (event as CustomEvent<DroneEventName>).detail;
      if (droneEvent === eventName && !this.stopped) {
        void this.trackTask(Promise.resolve().then(handler)).catch(this.onError);
      }
    };
    this.eventWindows.forEach((eventWindow) => {
      eventWindow.addEventListener("hopper-drone-event", listener);
      this.cleanupCallbacks.push(
        () => eventWindow.removeEventListener("hopper-drone-event", listener),
      );
    });
  }

  keyIsPressed(key: string) {
    return this.pressedKeys.has(key);
  }

  runBlock<T>(blockId: string, handler: () => T | Promise<T>) {
    if (this.stopped) return Promise.reject<T>(new Error("Program stopped"));
    const task = (async () => {
      const active = { token: Symbol(blockId), blockId };
      this.activeBlocks.push(active);
      this.onActiveBlock(blockId);
      try {
        return await handler();
      } finally {
        const activeIndex = this.activeBlocks.findIndex((entry) => entry.token === active.token);
        if (activeIndex >= 0) this.activeBlocks.splice(activeIndex, 1);
        this.onActiveBlock(this.activeBlocks.at(-1)?.blockId ?? null);
      }
    })();
    return this.trackTask(task);
  }

  async repeatForSeconds(seconds: number, handler: AsyncHandler) {
    const endAt = performance.now() + Math.max(0, Number(seconds) || 0) * 1000;
    while (!this.stopped && performance.now() < endAt) {
      await handler();
      await this.tick();
    }
  }

  async tick() {
    await new Promise<void>((resolve) => this.timingWindow.setTimeout(resolve, 0));
    if (this.stopped) throw new Error("Program stopped");
  }

  waitUntilStopped() {
    return this.stopPromise;
  }

  waitUntilIdle() {
    if (this.pendingTasks.size === 0) return Promise.resolve();
    return new Promise<void>((resolve) => this.idleResolvers.add(resolve));
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.activeBlocks = [];
    this.onActiveBlock(null);
    this.cleanupCallbacks.splice(0).forEach((cleanup) => cleanup());
    this.onStop();
    this.stopResolver?.();
  }

  private normalizeKey(key: string) {
    if (key === " ") return "Space";
    return key.length === 1 ? key.toLowerCase() : key;
  }

  private trackTask<T>(task: Promise<T>) {
    this.pendingTasks.add(task);
    const settle = () => {
      this.pendingTasks.delete(task);
      if (this.pendingTasks.size !== 0) return;
      this.idleResolvers.forEach((resolve) => resolve());
      this.idleResolvers.clear();
    };
    void task.then(settle, settle);
    return task;
  }
}
