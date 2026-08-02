import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";

type NativeDevice = { id: string; name?: string };
type NativeNotification = {
  deviceId: string;
  service: string;
  characteristic: string;
  value: string;
};

type NativeDisconnect = { deviceId: string };
type NativeCameraFrame = { value: string };
type NativeCameraError = { message: string };

interface HopperNativePlugin {
  requestDevice(options: { namePrefixes: string[] }): Promise<NativeDevice>;
  connect(options: { deviceId: string }): Promise<void>;
  disconnect(options: { deviceId: string }): Promise<void>;
  read(options: { deviceId: string; service: string; characteristic: string }): Promise<{ value: string }>;
  write(options: { deviceId: string; service: string; characteristic: string; value: string }): Promise<void>;
  startNotifications(options: { deviceId: string; service: string; characteristic: string }): Promise<void>;
  checkCamera(options: { url: string }): Promise<{ connected: boolean }>;
  startCamera(options: { url: string }): Promise<void>;
  stopCamera(): Promise<void>;
  addListener(eventName: "notification", listener: (event: NativeNotification) => void): Promise<PluginListenerHandle>;
  addListener(eventName: "disconnected", listener: (event: NativeDisconnect) => void): Promise<PluginListenerHandle>;
  addListener(eventName: "cameraFrame", listener: (event: NativeCameraFrame) => void): Promise<PluginListenerHandle>;
  addListener(eventName: "cameraError", listener: (event: NativeCameraError) => void): Promise<PluginListenerHandle>;
}

const HopperNative = registerPlugin<HopperNativePlugin>("HopperNative");

export const isNativeIPadApp = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

const normalizeUuid = (uuid: string) => uuid.toLowerCase();

const bytesToBase64 = (source: BufferSource) => {
  const bytes = source instanceof ArrayBuffer
    ? new Uint8Array(source)
    : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
};

const base64ToDataView = (value: string) => {
  const binary = window.atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new DataView(bytes.buffer);
};

type CharacteristicListener = (event: { target: { value: DataView } }) => void;

class NativeGattCharacteristic {
  readonly uuid: string;
  private listeners = new Set<CharacteristicListener>();
  private notificationHandle: PluginListenerHandle | null = null;

  constructor(
    private readonly deviceId: string,
    private readonly service: string,
    characteristic: string,
  ) {
    this.uuid = normalizeUuid(characteristic);
  }

  async readValue() {
    const result = await HopperNative.read({
      deviceId: this.deviceId,
      service: this.service,
      characteristic: this.uuid,
    });
    return base64ToDataView(result.value);
  }

  async writeValue(value: BufferSource) {
    await HopperNative.write({
      deviceId: this.deviceId,
      service: this.service,
      characteristic: this.uuid,
      value: bytesToBase64(value),
    });
  }

  async startNotifications() {
    if (!this.notificationHandle) {
      this.notificationHandle = await HopperNative.addListener("notification", (event) => {
        if (
          event.deviceId !== this.deviceId
          || normalizeUuid(event.service) !== this.service
          || normalizeUuid(event.characteristic) !== this.uuid
        ) return;
        const value = base64ToDataView(event.value);
        this.listeners.forEach((listener) => listener({ target: { value } }));
      });
    }
    await HopperNative.startNotifications({
      deviceId: this.deviceId,
      service: this.service,
      characteristic: this.uuid,
    });
    return this;
  }

  addEventListener(name: "characteristicvaluechanged", listener: CharacteristicListener) {
    if (name === "characteristicvaluechanged") this.listeners.add(listener);
  }
}

class NativeGattService {
  private characteristics = new Map<string, NativeGattCharacteristic>();

  constructor(
    private readonly deviceId: string,
    private readonly uuid: string,
  ) {}

  async getCharacteristic(uuid: string) {
    const normalized = normalizeUuid(uuid);
    let characteristic = this.characteristics.get(normalized);
    if (!characteristic) {
      characteristic = new NativeGattCharacteristic(this.deviceId, this.uuid, normalized);
      this.characteristics.set(normalized, characteristic);
    }
    return characteristic;
  }
}

class NativeGattServer {
  connected = false;
  private services = new Map<string, NativeGattService>();

  constructor(private readonly deviceId: string) {}

  async connect() {
    await HopperNative.connect({ deviceId: this.deviceId });
    this.connected = true;
    return this;
  }

  disconnect() {
    this.connected = false;
    void HopperNative.disconnect({ deviceId: this.deviceId });
  }

  async getPrimaryService(uuid: string) {
    const normalized = normalizeUuid(uuid);
    let service = this.services.get(normalized);
    if (!service) {
      service = new NativeGattService(this.deviceId, normalized);
      this.services.set(normalized, service);
    }
    return service;
  }
}

class NativeBluetoothDevice {
  readonly gatt: NativeGattServer;
  private disconnectListeners = new Set<() => void>();

  constructor(readonly id: string, readonly name?: string) {
    this.gatt = new NativeGattServer(id);
    void HopperNative.addListener("disconnected", (event) => {
      if (event.deviceId !== this.id) return;
      this.gatt.connected = false;
      this.disconnectListeners.forEach((listener) => listener());
    });
  }

  async forget() {
    this.gatt.disconnect();
  }

  addEventListener(name: "gattserverdisconnected", listener: () => void) {
    if (name === "gattserverdisconnected") this.disconnectListeners.add(listener);
  }
}

export const nativeBluetoothApi = isNativeIPadApp()
  ? {
      async requestDevice(options: { filters: Array<{ namePrefix: string }> }) {
        const selected = await HopperNative.requestDevice({
          namePrefixes: options.filters.map((filter) => filter.namePrefix),
        });
        return new NativeBluetoothDevice(selected.id, selected.name);
      },
    }
  : null;

if (typeof window !== "undefined" && nativeBluetoothApi) {
  (window as Window & { __hopperNativeBluetooth?: typeof nativeBluetoothApi })
    .__hopperNativeBluetooth = nativeBluetoothApi;
}

export const checkNativeCamera = async (url: string) =>
  (await HopperNative.checkCamera({ url })).connected;

export const startNativeCamera = async (
  url: string,
  onFrame: (dataUrl: string) => void,
  onError: (message: string) => void,
) => {
  const frameHandle = await HopperNative.addListener("cameraFrame", (event) => {
    onFrame(`data:image/jpeg;base64,${event.value}`);
  });
  const errorHandle = await HopperNative.addListener("cameraError", (event) => {
    onError(event.message);
  });
  try {
    await HopperNative.startCamera({ url });
  } catch (error) {
    await frameHandle.remove();
    await errorHandle.remove();
    throw error;
  }
  return async () => {
    await HopperNative.stopCamera().catch(() => undefined);
    await frameHandle.remove();
    await errorHandle.remove();
  };
};
