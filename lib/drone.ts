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
  private gunUSBID: number | null = null;
  private gunAttached = false;
  private clawUSBID: number | null = null;
  private clawAttached = false;
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
    this.stopConnectionPing();
    this.stopFlightPing();
    this.gattServer?.disconnect();
    this.gattServer = null;
    this.emitTelemetry();
  }

  async startRun() {
    this.cancelRunFlag = false;
    this.stopConnectionPing();
    this.reset();
    this.startFlightPing();
  }

  async stopRun() {
    this.reset();
    await this.landNoWait();
    this.startConnectionPing();
  }

  async takeOff() {
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
    await this.writeCommand("fa00", "fa0b", [
      2,
      this.nextSequence("fa0b"),
      2,
      0,
      1,
      0,
    ]);
    await this.wait(3);
    this.startFlightPing();
  }

  async land() {
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
    this.reset();
    this.stopFlightPing();
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

  async rotate(degrees = 0, direction: "clockwise" | "counterclockwise" = "clockwise") {
    const safeDegrees = Math.max(0, Number(degrees) || 0);
    const seconds = safeDegrees / 180;
    this.flightCommandBuffer.yaw = {
      consign: direction === "clockwise" ? 100 : -100,
      driveStepsRemaining: seconds * 20,
    };
    await this.wait(seconds);
    await this.wait(2);
  }

  async fly(
    direction: "up" | "down" | "left" | "right" | "forward" | "backward",
    seconds = 0,
    power = 0,
  ) {
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
    await this.wait(2);
  }

  setAxis(axis: "pitch" | "roll" | "yaw" | "gaz" | "altitude", power: number) {
    const normalizedAxis = axis === "altitude" ? "gaz" : axis;
    this.flightCommandBuffer[normalizedAxis].consign = Math.max(
      -100,
      Math.min(100, Number(power) || 0),
    );
    this.flightCommandBuffer[normalizedAxis].driveStepsRemaining = Infinity;
  }

  async flip(direction: "forward" | "backward" | "left" | "right") {
    if (this.cancelRunFlag) return;
    const directionEnum = { forward: 0, backward: 1, right: 2, left: 3 }[direction];
    this.stopFlightPing();
    await this.writeCommand("fa00", "fa0b", [
      2,
      this.nextSequence("fa0b"),
      2,
      4,
      0,
      0,
      directionEnum,
      0,
      0,
      0,
    ]);
    this.startFlightPing();
    await this.wait(2.5);
  }

  async waitUntilBatteryLevelChanges() {
    const initialLevel = this.batteryLevel;
    while (!this.cancelRunFlag && this.batteryLevel === initialLevel) {
      await sleep(100);
    }
  }

  async wait(seconds: number) {
    const endAt = performance.now() + Math.max(0, Number(seconds) || 0) * 1000;
    while (!this.cancelRunFlag && performance.now() < endAt) {
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
    this.startFlightPing();
    await this.wait(3);
  }

  async grabber(openOrClose: "OPEN" | "CLOSE") {
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
    this.startFlightPing();
    await this.wait(2);
  }

  private nextSequence(channel: keyof typeof this.sequence) {
    const current = this.sequence[channel] % 255;
    this.sequence[channel] += 1;
    return current;
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
    const buffer = this.flightCommandBuffer;
    for (const axis of Object.keys(buffer) as Array<keyof typeof buffer>) {
      buffer[axis].driveStepsRemaining -= 1;
      if (buffer[axis].driveStepsRemaining < 0) buffer[axis].consign = 0;
    }
    const moving = buffer.pitch.consign !== 0 || buffer.roll.consign !== 0;
    await this.writeCommand("fa00", "fa0b", [
      2,
      this.nextSequence("fa0b"),
      2,
      0,
      2,
      0,
      moving ? 1 : 0,
      buffer.roll.consign,
      buffer.pitch.consign,
      buffer.yaw.consign,
      buffer.gaz.consign,
      0,
      0,
      0,
      0,
    ]).catch(() => undefined);
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
