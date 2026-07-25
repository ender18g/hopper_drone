export type DroneEventName =
  | "flying"
  | "landed"
  | "crashed"
  | "batteryLevelChanged";

export type DroneTelemetry = {
  batteryLevel: number | null;
  flyingState: string | null;
  connected: boolean;
};

export type ManualFlightDirection = "forward" | "backward" | "left" | "right";

/**
 * The command surface shared by the Bluetooth Hopper and the classroom
 * simulator. Blockly-generated programs only depend on this interface, so a
 * student can switch aircraft without rebuilding or clearing their workspace.
 */
export interface DroneController {
  cancelRunFlag: boolean;
  onTelemetry?: (telemetry: DroneTelemetry) => void;
  onEvent?: (eventName: DroneEventName) => void;
  disconnect(): void;
  abortRun(): void;
  startRun(): Promise<void>;
  stopRun(): Promise<void>;
  takeOff(): Promise<void>;
  land(): Promise<void>;
  landNoWait(): Promise<void>;
  forceLand(): Promise<void>;
  cutoff(): Promise<void>;
  hover(): Promise<void>;
  reset(): void;
  manualNudge(direction: ManualFlightDirection, power?: number, seconds?: number): Promise<void>;
  rotate(degrees?: number, direction?: "clockwise" | "counterclockwise"): Promise<void>;
  fly(
    direction: "up" | "down" | "left" | "right" | "forward" | "backward",
    seconds?: number,
    power?: number,
  ): Promise<void>;
  setAxis(axis: "pitch" | "roll" | "yaw" | "gaz" | "altitude", power: number): void;
  flip(direction: "forward" | "backward" | "left" | "right"): Promise<void>;
  waitUntilBatteryLevelChanges(): Promise<void>;
  wait(seconds: number): Promise<void>;
  getBatteryLevel(): number | null;
  isFlying(): boolean;
  isLanded(): boolean;
  takePicture(): Promise<void>;
  fireGun(): Promise<void>;
  grabber(openOrClose: "OPEN" | "CLOSE"): Promise<void>;
}

export const createEmptyDroneTelemetry = (): DroneTelemetry => ({
  batteryLevel: null,
  flyingState: null,
  connected: false,
});

type GattCharacteristic = {
  uuid: string;
  readValue(): Promise<DataView>;
  writeValue(value: BufferSource): Promise<void>;
  startNotifications(): Promise<GattCharacteristic>;
  addEventListener(
    name: "characteristicvaluechanged",
    listener: (event: { target: { value: DataView } }) => void,
  ): void;
};

type GattService = {
  getCharacteristic(uuid: string): Promise<GattCharacteristic>;
};

type GattServer = {
  connected: boolean;
  connect(): Promise<GattServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<GattService>;
};

export type BluetoothDeviceLike = {
  id: string;
  name?: string;
  gatt?: GattServer;
  forget?: () => Promise<void>;
  addEventListener(
    name: "gattserverdisconnected",
    listener: () => void,
  ): void;
};

type BluetoothApi = {
  requestDevice(options: {
    filters: Array<{ namePrefix: string }>;
    optionalServices: string[];
  }): Promise<BluetoothDeviceLike>;
};

const FULL_UUID_SUFFIX = "-0800-9191-11e4-012d1540cb8e";
const ACK_PACKET_TYPE = 0x01;
const DATA_WITH_ACK_PACKET_TYPE = 0x04;
const COMMAND_ACK_TIMEOUT_MS = 180;
const COMMAND_ACK_ATTEMPTS = 5;

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

const arraysEqual = (left: Uint8Array, right: number[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export class FlightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlightError";
  }
}

/**
 * BLE controller adapted from the open-source FTW Code / Parrot Mambo driver.
 * Hopper drones expose the same command services and packet layout.
 */
export class MamboController {
  readonly droneBluetoothDevice: BluetoothDeviceLike;
  gattServer: GattServer | null = null;
  droneName: string | null = null;
  batteryLevel: number | null = null;
  flyingState: string | null = null;
  flyingOrLanded: "flying" | "landed" = "landed";
  cancelRunFlag = false;
  onTelemetry?: (telemetry: DroneTelemetry) => void;
  onEvent?: (eventName: DroneEventName) => void;

  private sequence = { fa0a: 0, fa0b: 0, fa0c: 0 };
  private connectionPing: number | null = null;
  private flightCommandPing: number | null = null;
  private runGeneration = 0;
  private manualFlightOverride: {
    token: symbol;
    roll: number;
    pitch: number;
    yaw: number;
    gaz: number;
  } | null = null;
  private gunUSBID: number | null = null;
  private gunAttached = false;
  private clawUSBID: number | null = null;
  private clawAttached = false;
  private pendingCommandAcks = new Map<number, {
    acknowledge(): void;
    cancel(): void;
  }>();
  private flightCommandBuffer = this.emptyFlightBuffer();

  constructor(device: BluetoothDeviceLike) {
    this.droneBluetoothDevice = device;
  }

  async connect() {
    if (!this.droneBluetoothDevice.gatt) {
      throw new FlightError("The selected device does not expose a Bluetooth GATT server.");
    }

    this.gattServer = await this.droneBluetoothDevice.gatt.connect();
    this.droneName = this.droneBluetoothDevice.name || "Hopper";

    const notificationCharacteristics: Array<[string, string]> = [
      ["fb00", "fb0e"],
      ["fb00", "fb0f"],
      ["fb00", "fb1b"],
      ["fb00", "fb1c"],
      ["fd21", "fd22"],
      ["fd21", "fd23"],
      ["fd51", "fd52"],
      ["fd51", "fd53"],
    ];

    for (const [service, characteristic] of notificationCharacteristics) {
      try {
        await this.startNotifications(service, characteristic);
      } catch {
        // Hopper firmware variants do not all expose every notification channel.
      }
    }

    // Limit yaw to 180 degrees per second, then request the current state set.
    await this.writeCommand("fa00", "fa0b", [
      2,
      this.nextSequence("fa0b"),
      2,
      1,
      1,
      0,
      0,
      0,
      0x34,
      0x43,
    ]);
    await this.writeCommand("fa00", "fa0a", [
      2,
      this.nextSequence("fa0a"),
      0,
      4,
      0,
      0,
    ]);
    this.startConnectionPing();
    this.emitTelemetry();
  }

  disconnect() {
    this.abortRun();
    this.stopConnectionPing();
    this.gattServer?.disconnect();
    this.gattServer = null;
    this.emitTelemetry();
  }

  abortRun() {
    this.runGeneration += 1;
    this.cancelRunFlag = true;
    this.reset();
    this.manualFlightOverride = null;
    this.stopFlightPing();
  }

  async startRun() {
    this.runGeneration += 1;
    this.cancelRunFlag = false;
    this.manualFlightOverride = null;
    this.stopConnectionPing();
    this.reset();
    this.startFlightPing();
  }

  async stopRun() {
    this.abortRun();
    await this.landNoWait();
    this.startConnectionPing();
  }

  async takeOff() {
    const generation = this.runGeneration;
    if (this.cancelRunFlag) return;
    if (this.batteryLevel !== null && this.batteryLevel <= 10) {
      throw new FlightError("Low battery: charge the drone before takeoff.");
    }
    this.stopFlightPing();
    await this.writeCommand("fa00", "fa0b", [
      2,
      this.nextSequence("fa0b"),
      2,
      0,
      0,
      0,
    ]);
    if (!this.isRunActive(generation)) return;
    await this.writeCommand("fa00", "fa0b", [
      2,
      this.nextSequence("fa0b"),
      2,
      0,
      1,
      0,
    ]);
    if (!this.isRunActive(generation)) return;
    await this.wait(3);
    if (!this.isRunActive(generation)) return;
    this.startFlightPing();
  }

  async land() {
    const generation = this.runGeneration;
    if (this.cancelRunFlag) return;
    this.reset();
    this.stopFlightPing();
    await sleep(50);
    await this.writeCommand("fa00", "fa0b", [
      2,
      this.nextSequence("fa0b"),
      2,
      0,
      3,
      0,
    ]);
    if (!this.isRunActive(generation)) return;
    this.startFlightPing();
    await this.wait(5);
  }

  async landNoWait() {
    this.reset();
    this.stopFlightPing();
    await sleep(51);
    await this.writeCommand("fa00", "fa0b", [
      2,
      this.nextSequence("fa0b"),
      2,
      0,
      3,
      0,
    ]);
  }

  async forceLand() {
    this.abortRun();
    for (let index = 0; index < 20; index += 1) {
      await this.writeCommand("fa00", "fa0c", [
        2,
        this.nextSequence("fa0c"),
        2,
        0,
        3,
        0,
      ]);
      await sleep(50);
    }
    this.startConnectionPing();
  }

  async cutoff() {
    await this.writeCommand("fa00", "fa0c", [
      2,
      this.nextSequence("fa0c"),
      2,
      0,
      4,
      0,
    ]);
    await sleep(200);
  }

  async hover() {
    this.reset();
    await this.wait(1);
  }

  reset() {
    this.flightCommandBuffer = this.emptyFlightBuffer();
  }

  async manualNudge(
    direction: ManualFlightDirection,
    power = 30,
    seconds = 0.45,
  ) {
    if (this.cancelRunFlag || !this.isFlying()) return;
    const safePower = Math.max(1, Math.min(100, Math.abs(Number(power) || 30)));
    const safeSeconds = Math.max(0.15, Math.min(1.5, Number(seconds) || 0.45));
    const token = Symbol(direction);
    this.manualFlightOverride = {
      token,
      roll: direction === "right" ? safePower : direction === "left" ? -safePower : 0,
      pitch: direction === "forward" ? safePower : direction === "backward" ? -safePower : 0,
      yaw: 0,
      gaz: 0,
    };
    await sleep(safeSeconds * 1000);
    if (this.manualFlightOverride?.token === token) this.manualFlightOverride = null;
  }

  async rotate(degrees = 0, direction: "clockwise" | "counterclockwise" = "clockwise") {
    const generation = this.runGeneration;
    if (!this.isRunActive(generation)) return;
    const safeDegrees = Math.max(0, Number(degrees) || 0);
    const seconds = safeDegrees / 180;
    this.flightCommandBuffer.yaw = {
      consign: direction === "clockwise" ? 100 : -100,
      driveStepsRemaining: seconds * 20,
    };
    await this.wait(seconds);
    if (!this.isRunActive(generation)) return;
    await this.wait(2);
  }

  async fly(
    direction: "up" | "down" | "left" | "right" | "forward" | "backward",
    seconds = 0,
    power = 0,
  ) {
    const generation = this.runGeneration;
    if (!this.isRunActive(generation)) return;
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    let safePower = Math.max(-100, Math.min(100, Number(power) || 0));
    let axis: "gaz" | "roll" | "pitch";

    if (direction === "up" || direction === "down") axis = "gaz";
    else if (direction === "left" || direction === "right") axis = "roll";
    else axis = "pitch";

    if (["down", "left", "backward"].includes(direction)) safePower *= -1;
    this.flightCommandBuffer[axis] = {
      consign: safePower,
      driveStepsRemaining: safeSeconds * 20,
    };
    await this.wait(safeSeconds);
    if (!this.isRunActive(generation)) return;
    await this.wait(2);
  }

  setAxis(axis: "pitch" | "roll" | "yaw" | "gaz" | "altitude", power: number) {
    if (this.cancelRunFlag) return;
    const normalizedAxis = axis === "altitude" ? "gaz" : axis;
    this.flightCommandBuffer[normalizedAxis].consign = Math.max(
      -100,
      Math.min(100, Number(power) || 0),
    );
    this.flightCommandBuffer[normalizedAxis].driveStepsRemaining = Infinity;
  }

  async flip(direction: "forward" | "backward" | "left" | "right") {
    const generation = this.runGeneration;
    if (this.cancelRunFlag) return;
    const directionEnum = { forward: 0, backward: 1, right: 2, left: 3 }[direction];
    this.reset();
    this.stopFlightPing();
    await sleep(100);
    try {
      await this.writeAcknowledgedCommand([
        2,
        4,
        0,
        0,
        directionEnum,
        0,
        0,
        0,
      ]);
    } finally {
      if (this.isRunActive(generation)) this.startFlightPing();
    }
    if (!this.isRunActive(generation)) return;
    await this.wait(2.5);
  }

  async waitUntilBatteryLevelChanges() {
    const generation = this.runGeneration;
    const initialLevel = this.batteryLevel;
    while (this.isRunActive(generation) && this.batteryLevel === initialLevel) {
      await sleep(100);
    }
  }

  async wait(seconds: number) {
    const generation = this.runGeneration;
    const endAt = performance.now() + Math.max(0, Number(seconds) || 0) * 1000;
    while (this.isRunActive(generation) && performance.now() < endAt) {
      await sleep(Math.min(100, Math.max(0, endAt - performance.now())));
    }
  }

  getBatteryLevel() {
    return this.batteryLevel;
  }

  isFlying() {
    return this.flyingOrLanded === "flying";
  }

  isLanded() {
    return this.flyingOrLanded === "landed";
  }

  async takePicture() {
    await this.writeCommand("fa00", "fa0b", [
      2,
      this.nextSequence("fa0b"),
      2,
      6,
      1,
      0,
    ]);
  }

  async fireGun() {
    const generation = this.runGeneration;
    if (!this.gunAttached || this.gunUSBID === null) {
      throw new FlightError("No cannon accessory is attached.");
    }
    this.stopFlightPing();
    await this.writeCommand("fa00", "fa0b", [
      2,
      this.nextSequence("fa0b"),
      2,
      16,
      2,
      0,
      this.gunUSBID,
      0,
      0,
      0,
      0,
    ]);
    if (!this.isRunActive(generation)) return;
    this.startFlightPing();
    await this.wait(3);
  }

  async grabber(openOrClose: "OPEN" | "CLOSE") {
    const generation = this.runGeneration;
    if (!this.clawAttached || this.clawUSBID === null) {
      throw new FlightError("No grabber accessory is attached.");
    }
    this.stopFlightPing();
    await this.writeCommand("fa00", "fa0b", [
      2,
      this.nextSequence("fa0b"),
      2,
      16,
      1,
      0,
      this.clawUSBID,
      openOrClose === "OPEN" ? 0 : 1,
      0,
      0,
      0,
    ]);
    if (!this.isRunActive(generation)) return;
    this.startFlightPing();
    await this.wait(2);
  }

  private nextSequence(channel: keyof typeof this.sequence) {
    const current = this.sequence[channel] % 255;
    this.sequence[channel] += 1;
    return current;
  }

  private isRunActive(generation: number) {
    return !this.cancelRunFlag && generation === this.runGeneration;
  }

  private getUUID(shortUUID: string) {
    return `9a66${shortUUID}${FULL_UUID_SUFFIX}`;
  }

  private async getCharacteristic(serviceID: string, characteristicID: string) {
    if (!this.gattServer) throw new FlightError("Drone is not connected.");
    const service = await this.gattServer.getPrimaryService(this.getUUID(serviceID));
    return service.getCharacteristic(this.getUUID(characteristicID));
  }

  private async writeCommand(serviceID: string, charID: string, values: number[]) {
    const characteristic = await this.getCharacteristic(serviceID, charID);
    const command = Uint8Array.from(values.map((value) => (value + 256) % 256));
    await characteristic.writeValue(command);
  }

  private async writeAcknowledgedCommand(payload: number[]) {
    const sequence = this.nextSequence("fa0b");
    const packet = [DATA_WITH_ACK_PACKET_TYPE, sequence, ...payload];
    let lastError: unknown = null;

    for (let attempt = 0; attempt < COMMAND_ACK_ATTEMPTS; attempt += 1) {
      const acknowledged = this.waitForCommandAck(sequence);
      try {
        await this.writeCommand("fa00", "fa0b", packet);
      } catch (error) {
        lastError = error;
        this.pendingCommandAcks.get(sequence)?.cancel();
        await acknowledged;
        continue;
      }
      if (await acknowledged) return;
    }

    throw new FlightError(
      lastError instanceof Error
        ? `The drone did not accept the flip command: ${lastError.message}`
        : "The drone did not acknowledge the flip command. Keep it hovering, check the battery, and try again.",
    );
  }

  private waitForCommandAck(sequence: number) {
    return new Promise<boolean>((resolve) => {
      let finished = false;
      const finish = (acknowledged: boolean) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        if (this.pendingCommandAcks.get(sequence) === pending) {
          this.pendingCommandAcks.delete(sequence);
        }
        resolve(acknowledged);
      };
      const pending = {
        acknowledge: () => finish(true),
        cancel: () => finish(false),
      };
      const timer = window.setTimeout(() => finish(false), COMMAND_ACK_TIMEOUT_MS);
      this.pendingCommandAcks.set(sequence, pending);
    });
  }

  private async startNotifications(serviceID: string, characteristicID: string) {
    const characteristic = await this.getCharacteristic(serviceID, characteristicID);
    await characteristic.startNotifications();
    characteristic.addEventListener("characteristicvaluechanged", (event) =>
      this.receivePacket(event.target.value),
    );
  }

  private startFlightPing() {
    if (this.flightCommandPing !== null) return;
    this.flightCommandPing = window.setInterval(() => {
      void this.sendFlightCommand();
    }, 50);
  }

  private stopFlightPing() {
    if (this.flightCommandPing !== null) window.clearInterval(this.flightCommandPing);
    this.flightCommandPing = null;
  }

  private async sendFlightCommand() {
    const generation = this.runGeneration;
    if (!this.isRunActive(generation)) return;
    const buffer = this.flightCommandBuffer;
    for (const axis of Object.keys(buffer) as Array<keyof typeof buffer>) {
      buffer[axis].driveStepsRemaining -= 1;
      if (buffer[axis].driveStepsRemaining < 0) buffer[axis].consign = 0;
    }
    const output = this.manualFlightOverride ?? {
      roll: buffer.roll.consign,
      pitch: buffer.pitch.consign,
      yaw: buffer.yaw.consign,
      gaz: buffer.gaz.consign,
    };
    const moving = output.pitch !== 0 || output.roll !== 0;
    const values = [
      2,
      this.nextSequence("fa0b"),
      2,
      0,
      2,
      0,
      moving ? 1 : 0,
      output.roll,
      output.pitch,
      output.yaw,
      output.gaz,
      0,
      0,
      0,
      0,
    ];
    try {
      const characteristic = await this.getCharacteristic("fa00", "fa0b");
      if (!this.isRunActive(generation)) return;
      const command = Uint8Array.from(values.map((value) => (value + 256) % 256));
      await characteristic.writeValue(command);
    } catch {
      // A stopped run or a transient Bluetooth write must not restart command traffic.
    }
  }

  private startConnectionPing() {
    if (this.connectionPing !== null) return;
    this.connectionPing = window.setInterval(() => {
      void this.writeCommand("fa00", "fa0a", [
        2,
        this.nextSequence("fa0a"),
        2,
        14,
        0,
        0,
        0,
      ]).catch(() => undefined);
    }, 2000);
  }

  private stopConnectionPing() {
    if (this.connectionPing !== null) window.clearInterval(this.connectionPing);
    this.connectionPing = null;
  }

  private emptyFlightBuffer() {
    return {
      roll: { consign: 0, driveStepsRemaining: Infinity },
      pitch: { consign: 0, driveStepsRemaining: Infinity },
      yaw: { consign: 0, driveStepsRemaining: Infinity },
      gaz: { consign: 0, driveStepsRemaining: Infinity },
    };
  }

  private receivePacket(view: DataView) {
    const packet = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    if (packet[0] === ACK_PACKET_TYPE && packet.length >= 3) {
      this.pendingCommandAcks.get(packet[2])?.acknowledge();
      return;
    }
    const command = packet.slice(2, 6);

    if (arraysEqual(command, [0, 5, 1, 0])) {
      const previous = this.batteryLevel;
      this.batteryLevel = packet[6];
      if (previous !== this.batteryLevel) this.emitEvent("batteryLevelChanged");
    }

    if (arraysEqual(command, [2, 3, 1, 0])) {
      const states = [
        "landed",
        "takingoff",
        "hovering",
        "flying",
        "landing",
        "emergency",
        "rolling",
        "init",
      ];
      const previous = this.flyingState;
      this.flyingState = states[packet[6]] || "unknown";
      if (previous === "takingoff" && ["hovering", "flying"].includes(this.flyingState)) {
        this.flyingOrLanded = "flying";
        this.emitEvent("flying");
      }
      if (previous === "landing" && this.flyingState === "landed") {
        this.flyingOrLanded = "landed";
        this.emitEvent("landed");
      }
      if (this.flyingState === "emergency") this.emitEvent("crashed");
    }

    if (arraysEqual(command, [2, 15, 2, 0])) {
      this.gunUSBID = packet[6];
      this.gunAttached = packet[11] <= 3;
    }
    if (arraysEqual(command, [2, 15, 1, 0])) {
      this.clawUSBID = packet[6];
      this.clawAttached = packet[11] <= 3;
    }
    this.emitTelemetry();
  }

  private emitEvent(eventName: DroneEventName) {
    this.onEvent?.(eventName);
    window.dispatchEvent(new CustomEvent("hopper-drone-event", { detail: eventName }));
  }

  private emitTelemetry() {
    this.onTelemetry?.({
      batteryLevel: this.batteryLevel,
      flyingState: this.flyingState,
      connected: Boolean(this.gattServer?.connected),
    });
  }
}

export function getBluetoothApi() {
  return (navigator as Navigator & { bluetooth?: BluetoothApi }).bluetooth || null;
}

export const hopperDeviceRequest = {
  filters: [
    "Mambo_",
    "mambo_",
    "MAMBO_",
    "TRAVIS_",
    "Travis_",
    "travis_",
    "FTW_",
    "ftw_",
    "Mars_",
    "HOPPER",
    "Hopper",
    "hopper",
  ].map((namePrefix) => ({ namePrefix })),
  optionalServices: [
    "9a66fa00-0800-9191-11e4-012d1540cb8e",
    "9a66fb00-0800-9191-11e4-012d1540cb8e",
    "9a66fd21-0800-9191-11e4-012d1540cb8e",
    "9a66fd51-0800-9191-11e4-012d1540cb8e",
    "0000180a-0000-1000-8000-00805f9b34fb",
  ],
};
