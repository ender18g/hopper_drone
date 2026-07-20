import type { DroneEventName } from "./drone";

type AsyncHandler = () => void | Promise<void>;

export class ExecutionRuntime {
  stopped = false;
  hasEvents = false;

  private pressedKeys = new Set<string>();
  private cleanupCallbacks: Array<() => void> = [];
  private stopResolver: (() => void) | null = null;
  private stopPromise = new Promise<void>((resolve) => {
    this.stopResolver = resolve;
  });

  constructor(
    private readonly onError: (error: unknown) => void,
    private readonly onStop: () => void,
  ) {
    const keyDown = (event: KeyboardEvent) => this.pressedKeys.add(this.normalizeKey(event.key));
    const keyUp = (event: KeyboardEvent) => this.pressedKeys.delete(this.normalizeKey(event.key));
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    this.cleanupCallbacks.push(() => window.removeEventListener("keydown", keyDown));
    this.cleanupCallbacks.push(() => window.removeEventListener("keyup", keyUp));
  }

  registerKey(kind: "pressed" | "released", key: string, handler: AsyncHandler) {
    this.hasEvents = true;
    const eventName = kind === "pressed" ? "keydown" : "keyup";
    const listener = (event: KeyboardEvent) => {
      if (this.normalizeKey(event.key) === key && !this.stopped) {
        Promise.resolve(handler()).catch(this.onError);
      }
    };
    window.addEventListener(eventName, listener);
    this.cleanupCallbacks.push(() => window.removeEventListener(eventName, listener));
  }

  registerDrone(eventName: DroneEventName, handler: AsyncHandler) {
    this.hasEvents = true;
    const listener = (event: Event) => {
      const droneEvent = (event as CustomEvent<DroneEventName>).detail;
      if (droneEvent === eventName && !this.stopped) {
        Promise.resolve(handler()).catch(this.onError);
      }
    };
    window.addEventListener("hopper-drone-event", listener);
    this.cleanupCallbacks.push(() => window.removeEventListener("hopper-drone-event", listener));
  }

  keyIsPressed(key: string) {
    return this.pressedKeys.has(key);
  }

  async repeatForSeconds(seconds: number, handler: AsyncHandler) {
    const endAt = performance.now() + Math.max(0, Number(seconds) || 0) * 1000;
    while (!this.stopped && performance.now() < endAt) {
      await handler();
      await this.tick();
    }
  }

  async tick() {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    if (this.stopped) throw new Error("Program stopped");
  }

  waitUntilStopped() {
    return this.stopPromise;
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.cleanupCallbacks.splice(0).forEach((cleanup) => cleanup());
    this.onStop();
    this.stopResolver?.();
  }

  private normalizeKey(key: string) {
    if (key === " ") return "Space";
    return key.length === 1 ? key.toLowerCase() : key;
  }
}
