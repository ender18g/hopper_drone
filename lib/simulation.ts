import type {
  DroneController,
  DroneEventName,
  DroneTelemetry,
  ManualFlightDirection,
} from "./drone";
import type { VisionDetection } from "./vision";
import type { AprilTagDetection } from "./apriltags";

export const SIMULATION_ROOM = { width: 10, height: 7 } as const;
export const SIMULATION_START = { x: 1.25, y: 1.2 } as const;

export type SimulationObject = {
  id: string;
  label: string;
  src?: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  kind?: "object" | "paper" | "apriltag";
  tagId?: number;
  uploaded?: boolean;
};

export type SimulationFlipDirection = "forward" | "backward" | "left" | "right";
export type SimulationFlipAxis = "pitch" | "roll";

export type SimulationSnapshot = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  heading: number;
  pitch: number;
  roll: number;
  flipAxis: SimulationFlipAxis | null;
  flipAngle: number;
  flipDirection: SimulationFlipDirection | null;
  yawRate: number;
  flyingState: string;
  connected: boolean;
  crashed: boolean;
  crashReason: string | null;
  crashSequence: number;
  batteryLevel: number;
  trail: Array<{ x: number; y: number }>;
};

export type SimulationSideViewPose = {
  heightPixels: number;
  pitchDegrees: number;
  rollFlipDegrees: number;
  pitchLabel: string;
  shadowOpacity: number;
  shadowScale: number;
  verticalSpeedLabel: string;
};

type Axis = "pitch" | "roll" | "yaw" | "gaz";
type FrameListener = (snapshot: SimulationSnapshot) => void;

const radians = (angle: number) => (angle * Math.PI) / 180;
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

export const powerToTiltDegrees = (power: number) => {
  const normalizedPower = clamp(Number(power) || 0, -100, 100);
  const direction = Math.sign(normalizedPower);
  return direction * 15 * Math.pow(Math.abs(normalizedPower) / 100, 0.78);
};

export const getSimulationFlipTransform = (
  direction: SimulationFlipDirection,
  progress: number,
) => ({
  axis: direction === "forward" || direction === "backward" ? "pitch" as const : "roll" as const,
  angle: (direction === "backward" || direction === "left" ? -1 : 1) * clamp(progress, 0, 1) * 360,
});

export const simulationAltitudeToPixels = (altitude: number) => {
  const safeAltitude = Math.max(0, Number(altitude) || 0);
  return 174 * (1 - Math.exp(-safeAltitude / 2.7));
};

export const getSimulationSideViewPose = (
  snapshot: Pick<SimulationSnapshot, "z" | "vz" | "pitch"> &
    Partial<Pick<SimulationSnapshot, "flipAxis" | "flipAngle" | "flipDirection">>,
): SimulationSideViewPose => {
  const altitude = Math.max(0, Number(snapshot.z) || 0);
  const verticalSpeed = Number(snapshot.vz) || 0;
  const flipAngle = Number(snapshot.flipAngle) || 0;
  const pitchDegrees = (Number(snapshot.pitch) || 0) + (snapshot.flipAxis === "pitch" ? flipAngle : 0);
  const rollFlipDegrees = snapshot.flipAxis === "roll" ? flipAngle : 0;
  return {
    heightPixels: simulationAltitudeToPixels(altitude),
    pitchDegrees,
    rollFlipDegrees,
    pitchLabel: snapshot.flipDirection
      ? `${snapshot.flipDirection.toUpperCase()} FLIP · ${Math.round(Math.abs(flipAngle))}°`
      : pitchDegrees > 0.45
        ? "FORWARD · NOSE DOWN"
        : pitchDegrees < -0.45
          ? "BACK · NOSE UP"
          : "LEVEL",
    shadowOpacity: Math.max(0.1, 0.58 - altitude * 0.2),
    shadowScale: Math.max(0.34, 1 - altitude * 0.18),
    verticalSpeedLabel: Math.abs(verticalSpeed) < 0.02
      ? "HOLD 0.00 m/s"
      : `${verticalSpeed > 0 ? "↑ +" : "↓ "}${verticalSpeed.toFixed(2)} m/s`,
  };
};

export function projectObjectToCamera(
  snapshot: SimulationSnapshot,
  object: SimulationObject,
  width: number,
  height: number,
) {
  const heading = radians(snapshot.heading);
  const deltaX = object.x - snapshot.x;
  const deltaY = object.y - snapshot.y;
  const cameraRight = deltaX * Math.cos(heading) - deltaY * Math.sin(heading);
  const cameraForward = deltaX * Math.sin(heading) + deltaY * Math.cos(heading);
  const fieldWidth = Math.max(1.05, snapshot.z * 1.8 + 0.62);
  const fieldHeight = fieldWidth * (height / width);
  const centerX = width / 2 + (cameraRight / fieldWidth) * width;
  const centerY = height / 2 - (cameraForward / fieldHeight) * height;
  const objectPixels = Math.max(12, (object.size / fieldWidth) * width);
  const left = centerX - objectPixels / 2;
  const top = centerY - objectPixels / 2;
  const visible =
    left < width &&
    top < height &&
    left + objectPixels > 0 &&
    top + objectPixels > 0;
  return {
    visible,
    centerX,
    centerY,
    size: objectPixels,
    fieldWidth,
    fieldHeight,
  };
}

/** A small deterministic rigid-body approximation tuned for classroom use. */
export class SimulatedDroneController implements DroneController {
  cancelRunFlag = false;
  onTelemetry?: (telemetry: DroneTelemetry) => void;
  onEvent?: (eventName: DroneEventName) => void;

  private connected = false;
  private runGeneration = 0;
  private manualFlightOverride: {
    token: symbol;
    roll: number;
    pitch: number;
    yaw: number;
    gaz: number;
  } | null = null;
  private animationFrame: number | null = null;
  private previousFrame = 0;
  private telemetryElapsed = 0;
  private trailElapsed = 0;
  private listeners = new Set<FrameListener>();
  private sceneObjects: SimulationObject[] = [];
  private axes: Record<Axis, number> = { pitch: 0, roll: 0, yaw: 0, gaz: 0 };
  private targetAltitude: number | null = null;
  private pitchVelocity = 0;
  private rollVelocity = 0;
  private manualPitch: number | null = null;
  private manualRoll: number | null = null;
  private manualOverrideUntil = 0;
  private flipAnimation: {
    direction: SimulationFlipDirection;
    startedAt: number;
    durationMs: number;
    anchorX: number;
    anchorY: number;
  } | null = null;
  private snapshot: SimulationSnapshot = this.initialSnapshot();

  connect() {
    if (this.connected) return;
    this.connected = true;
    this.snapshot = { ...this.snapshot, connected: true };
    this.previousFrame = performance.now();
    this.animationFrame = window.requestAnimationFrame(this.frame);
    this.emitTelemetry();
    this.emitFrame();
  }

  disconnect() {
    this.abortRun();
    this.connected = false;
    if (this.animationFrame !== null) window.cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.snapshot = { ...this.snapshot, connected: false };
    this.emitTelemetry();
    this.emitFrame();
  }

  subscribe(listener: FrameListener) {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot() {
    return {
      ...this.snapshot,
      trail: this.snapshot.trail.map((point) => ({ ...point })),
    };
  }

  setSceneObjects(objects: SimulationObject[]) {
    this.sceneObjects = objects;
  }

  getSyntheticDetections(width = 640, height = 480): VisionDetection[] {
    if (!this.connected || this.snapshot.crashed) return [];
    return this.sceneObjects.flatMap((object) => {
      if (object.kind && object.kind !== "object") return [];
      const projection = projectObjectToCamera(this.snapshot, object, width, height);
      if (!projection.visible) return [];
      const boxLeft = clamp(projection.centerX - projection.size / 2, 0, width);
      const boxTop = clamp(projection.centerY - projection.size / 2, 0, height);
      const boxRight = clamp(projection.centerX + projection.size / 2, 0, width);
      const boxBottom = clamp(projection.centerY + projection.size / 2, 0, height);
      const centerX = clamp((projection.centerX / width - 0.5) * 200, -100, 100);
      const centerY = clamp((0.5 - projection.centerY / height) * 200, -100, 100);
      return [{
        bbox: [boxLeft, boxTop, boxRight - boxLeft, boxBottom - boxTop],
        class: object.label,
        score: 0.98,
        frameWidth: width,
        frameHeight: height,
        centerX: Math.round(centerX * 10) / 10,
        centerY: Math.round(centerY * 10) / 10,
      }];
    });
  }

  getSyntheticAprilTags(width = 640, height = 480): AprilTagDetection[] {
    if (!this.connected || this.snapshot.crashed) return [];
    return this.sceneObjects.flatMap((object) => {
      if (object.kind !== "apriltag" || object.tagId === undefined) return [];
      const projection = projectObjectToCamera(this.snapshot, object, width, height);
      if (!projection.visible) return [];
      const angle = radians(object.rotation - this.snapshot.heading);
      const halfSize = projection.size / 2;
      const rotatePoint = (localX: number, localY: number) => ({
        x: projection.centerX + localX * Math.cos(angle) - localY * Math.sin(angle),
        y: projection.centerY + localX * Math.sin(angle) + localY * Math.cos(angle),
      });
      const corners: AprilTagDetection["corners"] = [
        rotatePoint(-halfSize, -halfSize),
        rotatePoint(halfSize, -halfSize),
        rotatePoint(halfSize, halfSize),
        rotatePoint(-halfSize, halfSize),
      ];
      const xs = corners.map((point) => point.x);
      const ys = corners.map((point) => point.y);
      const left = Math.max(0, Math.min(...xs));
      const top = Math.max(0, Math.min(...ys));
      const right = Math.min(width, Math.max(...xs));
      const bottom = Math.min(height, Math.max(...ys));
      const centerX = clamp((projection.centerX / width - 0.5) * 200, -100, 100);
      const centerY = clamp((0.5 - projection.centerY / height) * 200, -100, 100);
      return [{
        id: object.tagId,
        family: "tag36h11",
        corners,
        center: { x: projection.centerX, y: projection.centerY },
        bbox: [left, top, right - left, bottom - top],
        frameWidth: width,
        frameHeight: height,
        centerX: Math.round(centerX * 10) / 10,
        centerY: Math.round(centerY * 10) / 10,
        yaw: Math.round(((object.rotation - this.snapshot.heading + 90 + 540) % 360 - 180) * 10) / 10,
        hamming: 0,
      }];
    });
  }

  resetSimulation() {
    const connected = this.connected;
    this.axes = { pitch: 0, roll: 0, yaw: 0, gaz: 0 };
    this.targetAltitude = null;
    this.pitchVelocity = 0;
    this.rollVelocity = 0;
    this.manualPitch = null;
    this.manualRoll = null;
    this.manualOverrideUntil = 0;
    this.flipAnimation = null;
    this.snapshot = { ...this.initialSnapshot(), connected };
    this.emitTelemetry();
    this.emitFrame();
  }

  placeDrone(x: number, y: number) {
    if (this.snapshot.crashed) return;
    this.clearFlip();
    const droneRadius = 0.064;
    this.snapshot = {
      ...this.snapshot,
      x: clamp(Number(x) || 0, droneRadius, SIMULATION_ROOM.width - droneRadius),
      y: clamp(Number(y) || 0, droneRadius, SIMULATION_ROOM.height - droneRadius),
      vx: 0,
      vy: 0,
      trail: this.snapshot.z <= 0.08 ? [] : this.snapshot.trail,
    };
    this.emitFrame();
  }

  async manualTilt(axis: "pitch" | "roll", angle: number, duration = 0.8) {
    if (this.snapshot.z < 0.1 || this.snapshot.crashed) return;
    const safeAngle = clamp(Number(angle) || 0, -15, 15);
    this.manualPitch = axis === "pitch" ? safeAngle : 0;
    this.manualRoll = axis === "roll" ? safeAngle : 0;
    this.manualOverrideUntil = performance.now() + duration * 1000;
    await this.wait(duration);
  }

  abortRun() {
    this.runGeneration += 1;
    this.cancelRunFlag = true;
    this.reset();
    this.manualFlightOverride = null;
  }

  async startRun() {
    this.runGeneration += 1;
    this.cancelRunFlag = false;
    this.manualFlightOverride = null;
    this.reset();
  }

  async stopRun() {
    this.abortRun();
    await this.landNoWait();
  }

  async takeOff() {
    if (this.cancelRunFlag || this.snapshot.crashed || this.snapshot.z > 0.12) return;
    this.snapshot = { ...this.snapshot, flyingState: "takingoff" };
    this.targetAltitude = 1.25;
    this.emitTelemetry();
    await this.waitFor(() => this.snapshot.z >= 1.15 || this.snapshot.crashed, 4);
  }

  async land() {
    if (this.cancelRunFlag || this.snapshot.crashed) return;
    this.reset();
    this.snapshot = { ...this.snapshot, flyingState: "landing" };
    this.targetAltitude = 0;
    this.emitTelemetry();
    await this.waitFor(() => this.snapshot.z <= 0.01 || this.snapshot.crashed, 5);
  }

  async landNoWait() {
    if (this.snapshot.crashed) return;
    this.reset();
    this.snapshot = { ...this.snapshot, flyingState: "landing" };
    this.targetAltitude = 0;
    this.emitTelemetry();
  }

  async forceLand() {
    if (this.snapshot.crashed) return;
    this.abortRun();
    await this.landNoWait();
    const endAt = performance.now() + 3500;
    while (this.snapshot.z > 0.01 && !this.snapshot.crashed && performance.now() < endAt) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
    }
  }

  async cutoff() {
    if (this.snapshot.z <= 0.05) {
      this.crash("Motors cut off on the ground");
      return;
    }
    this.reset();
    this.targetAltitude = null;
    this.snapshot = { ...this.snapshot, flyingState: "emergency" };
    await this.wait(0.2);
  }

  async hover() {
    this.reset();
    if (this.snapshot.z > 0.08) this.targetAltitude = this.snapshot.z;
    await this.wait(1);
  }

  reset() {
    this.axes = { pitch: 0, roll: 0, yaw: 0, gaz: 0 };
    this.manualPitch = null;
    this.manualRoll = null;
    this.manualOverrideUntil = 0;
    this.clearFlip();
    if (this.snapshot.z > 0.08 && !this.snapshot.crashed) {
      this.targetAltitude = this.snapshot.z;
    }
  }

  async manualNudge(
    direction: ManualFlightDirection,
    power = 30,
    seconds = 0.45,
  ) {
    if (this.cancelRunFlag || !this.isFlying()) return;
    const safePower = clamp(Math.abs(Number(power) || 30), 1, 100);
    const safeSeconds = clamp(Number(seconds) || 0.45, 0.15, 1.5);
    const token = Symbol(direction);
    this.manualFlightOverride = {
      token,
      roll: direction === "right" ? safePower : direction === "left" ? -safePower : 0,
      pitch: direction === "forward" ? safePower : direction === "backward" ? -safePower : 0,
      yaw: 0,
      gaz: 0,
    };
    await new Promise<void>((resolve) => window.setTimeout(resolve, safeSeconds * 1000));
    if (this.manualFlightOverride?.token === token) this.manualFlightOverride = null;
  }

  async rotate(degreesToTurn = 0, direction: "clockwise" | "counterclockwise" = "clockwise") {
    const generation = this.runGeneration;
    if (!this.isRunActive(generation)) return;
    const safeDegrees = Math.max(0, Number(degreesToTurn) || 0);
    const seconds = safeDegrees / 180;
    this.axes.yaw = direction === "clockwise" ? 100 : -100;
    await this.wait(seconds);
    if (!this.isRunActive(generation)) return;
    this.axes.yaw = 0;
    await this.wait(0.55);
  }

  async fly(
    direction: "up" | "down" | "left" | "right" | "forward" | "backward",
    seconds = 0,
    power = 0,
  ) {
    const generation = this.runGeneration;
    if (!this.isRunActive(generation)) return;
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    let safePower = clamp(Number(power) || 0, -100, 100);
    let axis: Axis;
    if (direction === "up" || direction === "down") axis = "gaz";
    else if (direction === "left" || direction === "right") axis = "roll";
    else axis = "pitch";
    if (["down", "left", "backward"].includes(direction)) safePower *= -1;
    this.setAxis(axis, safePower);
    await this.wait(safeSeconds);
    if (!this.isRunActive(generation)) return;
    this.setAxis(axis, 0);
    await this.wait(2);
  }

  setAxis(axis: "pitch" | "roll" | "yaw" | "gaz" | "altitude", power: number) {
    if (this.cancelRunFlag) return;
    const normalizedAxis = axis === "altitude" ? "gaz" : axis;
    this.axes[normalizedAxis] = clamp(Number(power) || 0, -100, 100);
    if (normalizedAxis === "gaz") this.targetAltitude = null;
  }

  async flip(direction: SimulationFlipDirection) {
    if (this.cancelRunFlag || this.snapshot.z < 0.55 || this.snapshot.crashed) return;
    this.reset();
    const transform = getSimulationFlipTransform(direction, 0);
    const animation = {
      direction,
      startedAt: performance.now(),
      durationMs: 820,
      anchorX: this.snapshot.x,
      anchorY: this.snapshot.y,
    };
    this.flipAnimation = animation;
    this.pitchVelocity = 0;
    this.rollVelocity = 0;
    this.targetAltitude = this.snapshot.z;
    this.snapshot = {
      ...this.snapshot,
      vx: 0,
      vy: 0,
      pitch: 0,
      roll: 0,
      flipAxis: transform.axis,
      flipAngle: transform.angle,
      flipDirection: direction,
      flyingState: "flipping",
    };
    this.emitTelemetry();
    this.emitFrame();
    await this.wait(animation.durationMs / 1000);
    if (this.flipAnimation === animation) this.finishFlip();
  }

  async waitUntilBatteryLevelChanges() {
    const initialLevel = Math.floor(this.snapshot.batteryLevel);
    await this.waitFor(() => Math.floor(this.snapshot.batteryLevel) !== initialLevel, 45);
  }

  async wait(seconds: number) {
    const generation = this.runGeneration;
    const endAt = performance.now() + Math.max(0, Number(seconds) || 0) * 1000;
    while (this.isRunActive(generation) && performance.now() < endAt) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
    }
  }

  getBatteryLevel() {
    return Math.round(this.snapshot.batteryLevel);
  }

  isFlying() {
    return this.snapshot.z > 0.08 && !this.snapshot.crashed;
  }

  isLanded() {
    return this.snapshot.z <= 0.01 && !this.snapshot.crashed;
  }

  async takePicture() {
    await this.wait(0.12);
  }

  async fireGun() {
    await this.wait(0.25);
  }

  async grabber(openOrClose: "OPEN" | "CLOSE") {
    void openOrClose;
    await this.wait(0.35);
  }

  private frame = (now: number) => {
    if (!this.connected) return;
    const elapsed = clamp((now - this.previousFrame) / 1000, 0.001, 0.035);
    this.previousFrame = now;
    this.step(elapsed, now);
    this.animationFrame = window.requestAnimationFrame(this.frame);
  };

  private step(elapsed: number, now: number) {
    const current = this.snapshot;
    const airborne = current.z > 0.035;
    const emergency = current.flyingState === "emergency";
    const activeFlip = this.flipAnimation;

    const flightAxes = this.manualFlightOverride ?? this.axes;
    let targetPitch = powerToTiltDegrees(flightAxes.pitch);
    let targetRoll = powerToTiltDegrees(flightAxes.roll);
    if (now < this.manualOverrideUntil) {
      targetPitch = this.manualPitch ?? targetPitch;
      targetRoll = this.manualRoll ?? targetRoll;
    } else {
      this.manualPitch = null;
      this.manualRoll = null;
    }

    this.pitchVelocity += ((targetPitch - current.pitch) * 19 - this.pitchVelocity * 7.5) * elapsed;
    this.rollVelocity += ((targetRoll - current.roll) * 19 - this.rollVelocity * 7.5) * elapsed;
    const pitch = current.pitch + this.pitchVelocity * elapsed;
    const roll = current.roll + this.rollVelocity * elapsed;

    const targetYawRate = airborne && !emergency ? flightAxes.yaw * 1.8 : 0;
    const yawRate = current.yawRate + (targetYawRate - current.yawRate) * Math.min(1, elapsed * 5.4);
    const heading = (current.heading + yawRate * elapsed + 360) % 360;
    const headingRadians = radians(heading);

    let vx = current.vx;
    let vy = current.vy;
    let vz = current.vz;
    let z = current.z;
    let x = current.x;
    let y = current.y;
    let flyingState = current.flyingState;
    let flipAxis = current.flipAxis;
    let flipAngle = current.flipAngle;
    let flipDirection = current.flipDirection;

    if (activeFlip) {
      const progress = clamp((now - activeFlip.startedAt) / activeFlip.durationMs, 0, 1);
      const transform = getSimulationFlipTransform(activeFlip.direction, progress);
      flipAxis = transform.axis;
      flipAngle = transform.angle;
      flipDirection = activeFlip.direction;
      if (progress >= 1) {
        this.flipAnimation = null;
        flipAxis = null;
        flipAngle = 0;
        flipDirection = null;
        flyingState = airborne ? "hovering" : "landed";
      }
    }

    if ((airborne || flyingState === "takingoff" || flyingState === "landing") && !emergency) {
      const forwardAcceleration = 9.81 * Math.tan(radians(pitch));
      const rightAcceleration = 9.81 * Math.tan(radians(roll));
      const hoverWanderX = Math.sin(now / 1370) * 0.026 + Math.sin(now / 431) * 0.009;
      const hoverWanderY = Math.cos(now / 1190) * 0.024 + Math.sin(now / 607) * 0.01;
      vx += (
        Math.sin(headingRadians) * forwardAcceleration +
        Math.cos(headingRadians) * rightAcceleration +
        hoverWanderX -
        vx * 1.18
      ) * elapsed;
      vy += (
        Math.cos(headingRadians) * forwardAcceleration -
        Math.sin(headingRadians) * rightAcceleration +
        hoverWanderY -
        vy * 1.18
      ) * elapsed;

      const targetVerticalVelocity = this.targetAltitude === null
        ? flightAxes.gaz * 0.014
        : clamp((this.targetAltitude - z) * 1.7, -0.9, 1.25);
      vz += (targetVerticalVelocity - vz) * Math.min(1, elapsed * 3.6);
    } else if (emergency) {
      vz -= 9.81 * elapsed;
      vx *= Math.max(0, 1 - elapsed * 0.18);
      vy *= Math.max(0, 1 - elapsed * 0.18);
    } else {
      vx *= Math.max(0, 1 - elapsed * 8);
      vy *= Math.max(0, 1 - elapsed * 8);
      vz = 0;
    }

    x += vx * elapsed;
    y += vy * elapsed;
    z = Math.max(0, z + vz * elapsed);

    if (activeFlip) {
      x = activeFlip.anchorX;
      y = activeFlip.anchorY;
      vx = 0;
      vy = 0;
    }

    const droneRadius = 0.064;
    const hitLeft = x < droneRadius;
    const hitRight = x > SIMULATION_ROOM.width - droneRadius;
    const hitBottom = y < droneRadius;
    const hitTop = y > SIMULATION_ROOM.height - droneRadius;
    if (hitLeft || hitRight || hitBottom || hitTop) {
      const impactSpeed = Math.max(
        hitLeft || hitRight ? Math.abs(vx) : 0,
        hitBottom || hitTop ? Math.abs(vy) : 0,
      );
      x = clamp(x, droneRadius, SIMULATION_ROOM.width - droneRadius);
      y = clamp(y, droneRadius, SIMULATION_ROOM.height - droneRadius);
      if (airborne && impactSpeed > 1.55) {
        this.snapshot = { ...current, x, y, vx, vy, vz, z, pitch, roll, heading, yawRate };
        this.crash(`Wall impact at ${impactSpeed.toFixed(1)} m/s`);
        return;
      }
      if (hitLeft || hitRight) vx *= -0.16;
      if (hitBottom || hitTop) vy *= -0.16;
    }

    if (z <= 0) {
      const landingSpeed = Math.abs(vz);
      z = 0;
      vz = 0;
      if (emergency || landingSpeed > 1.65) {
        this.snapshot = { ...current, x, y, z, vx, vy, vz, pitch, roll, heading, yawRate };
        this.crash(emergency ? "Motors stopped in flight" : `Hard landing at ${landingSpeed.toFixed(1)} m/s`);
        return;
      }
      if (flyingState === "landing") {
        flyingState = "landed";
        this.targetAltitude = null;
        this.emitEvent("landed");
      }
    } else if (flyingState === "takingoff" && z >= 1.15) {
      flyingState = "hovering";
      this.emitEvent("flying");
    } else if (["hovering", "flying"].includes(flyingState)) {
      const activeMotion = Math.abs(targetPitch) + Math.abs(targetRoll) + Math.abs(this.axes.yaw);
      flyingState = activeMotion > 0.5 ? "flying" : "hovering";
    }

    this.trailElapsed += elapsed;
    let trail = current.trail;
    if (z > 0.12 && this.trailElapsed >= 0.12) {
      this.trailElapsed = 0;
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(x - last.x, y - last.y) > 0.045) {
        trail = [...trail.slice(-249), { x, y }];
      }
    }

    const batteryLevel = clamp(current.batteryLevel - (airborne ? elapsed * 0.035 : elapsed * 0.003), 0, 100);
    this.snapshot = {
      ...current,
      x,
      y,
      z,
      vx,
      vy,
      vz,
      pitch,
      roll,
      flipAxis,
      flipAngle,
      flipDirection,
      heading,
      yawRate,
      flyingState,
      batteryLevel,
      trail,
    };

    if (Math.floor(batteryLevel) !== Math.floor(current.batteryLevel)) {
      this.emitEvent("batteryLevelChanged");
    }

    this.telemetryElapsed += elapsed;
    if (this.telemetryElapsed >= 0.25) {
      this.telemetryElapsed = 0;
      this.emitTelemetry();
    }
    this.emitFrame();
  }

  private crash(reason: string) {
    if (this.snapshot.crashed) return;
    this.axes = { pitch: 0, roll: 0, yaw: 0, gaz: 0 };
    this.targetAltitude = null;
    this.flipAnimation = null;
    this.snapshot = {
      ...this.snapshot,
      z: 0,
      vz: 0,
      flipAxis: null,
      flipAngle: 0,
      flipDirection: null,
      crashed: true,
      flyingState: "emergency",
      crashReason: reason,
      crashSequence: this.snapshot.crashSequence + 1,
    };
    this.emitTelemetry();
    this.emitEvent("crashed");
    this.emitFrame();
  }

  private clearFlip() {
    this.flipAnimation = null;
    if (this.snapshot.flipAxis === null && this.snapshot.flipDirection === null) return;
    this.snapshot = {
      ...this.snapshot,
      flipAxis: null,
      flipAngle: 0,
      flipDirection: null,
      flyingState: this.snapshot.flyingState === "flipping"
        ? this.snapshot.z > 0.08 ? "hovering" : "landed"
        : this.snapshot.flyingState,
    };
  }

  private finishFlip() {
    this.clearFlip();
    this.emitTelemetry();
    this.emitFrame();
  }

  private async waitFor(predicate: () => boolean, timeoutSeconds: number) {
    const generation = this.runGeneration;
    const endAt = performance.now() + timeoutSeconds * 1000;
    while (this.isRunActive(generation) && !predicate() && performance.now() < endAt) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
    }
  }

  private isRunActive(generation: number) {
    return !this.cancelRunFlag && generation === this.runGeneration;
  }

  private initialSnapshot(): SimulationSnapshot {
    return {
      x: SIMULATION_START.x,
      y: SIMULATION_START.y,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      heading: 0,
      pitch: 0,
      roll: 0,
      flipAxis: null,
      flipAngle: 0,
      flipDirection: null,
      yawRate: 0,
      flyingState: "landed",
      connected: false,
      crashed: false,
      crashReason: null,
      crashSequence: 0,
      batteryLevel: 100,
      trail: [],
    };
  }

  private emitEvent(eventName: DroneEventName) {
    this.onEvent?.(eventName);
    window.dispatchEvent(new CustomEvent("hopper-drone-event", { detail: eventName }));
  }

  private emitTelemetry() {
    this.onTelemetry?.({
      batteryLevel: Math.round(this.snapshot.batteryLevel),
      flyingState: this.snapshot.flyingState,
      connected: this.connected,
    });
  }

  private emitFrame() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
