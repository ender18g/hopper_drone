import type { DetectedObject, ObjectDetection } from "@tensorflow-models/coco-ssd";
import type { CustomMobileNet } from "@teachablemachine/image";
import type { DroneController } from "./drone";
import { detectAprilTags, type AprilTagDetection } from "./apriltags";

export type BinaryColor = "white" | "black";

export type ThresholdResult = {
  threshold: number;
  invert: boolean;
  whiteCoverage: number;
  blackCoverage: number;
  centerWhite: boolean;
  frameWidth: number;
  frameHeight: number;
  binaryData: Uint8ClampedArray;
};

export type VisionScanKind = "threshold" | "object" | "apriltag" | "custom";

export type VisionScanEvent = {
  kind: VisionScanKind;
  phase: "start" | "complete" | "error";
  sequence: number;
};

export type ObjectCoordinate = {
  x: number;
  y: number;
};

type StoredObjectCoordinate = ObjectCoordinate & {
  confidence: number;
};

export type VisionDetection = DetectedObject & {
  frameWidth: number;
  frameHeight: number;
  centerX: number;
  centerY: number;
};

export type CustomPrediction = {
  className: string;
  probability: number;
};

const clampCoordinate = (value: number) => Math.max(-100, Math.min(100, value));
const clampPercent = (value: number) => Math.max(0, Math.min(100, Number(value) || 0));

export const analyzeThreshold = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  thresholdPercent = 60,
  invert = false,
): ThresholdResult => {
  const safeThreshold = clampPercent(thresholdPercent);
  const cutoff = safeThreshold * 2.55;
  const binaryData = new Uint8ClampedArray(data.length);
  let whitePixels = 0;
  for (let index = 0; index < data.length; index += 4) {
    const brightness = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
    const white = (brightness >= cutoff) !== Boolean(invert);
    const value = white ? 255 : 0;
    if (white) whitePixels += 1;
    binaryData[index] = value;
    binaryData[index + 1] = value;
    binaryData[index + 2] = value;
    binaryData[index + 3] = 255;
  }
  const total = width * height;
  const centerIndex = ((Math.floor(height / 2) * width) + Math.floor(width / 2)) * 4;
  const whiteCoverage = total === 0 ? 0 : (whitePixels / total) * 100;
  return {
    threshold: safeThreshold,
    invert: Boolean(invert),
    whiteCoverage,
    blackCoverage: 100 - whiteCoverage,
    centerWhite: binaryData[centerIndex] === 255,
    frameWidth: width,
    frameHeight: height,
    binaryData,
  };
};

export const detectionCenterCoordinate = (
  bbox: [number, number, number, number],
  frameWidth: number,
  frameHeight: number,
): ObjectCoordinate => {
  const centerX = bbox[0] + bbox[2] / 2;
  const centerY = bbox[1] + bbox[3] / 2;
  return {
    x: Math.round(clampCoordinate((centerX / frameWidth - 0.5) * 200) * 10) / 10,
    y: Math.round(clampCoordinate((0.5 - centerY / frameHeight) * 200) * 10) / 10,
  };
};

export class VisionRuntime {
  private model: ObjectDetection | null = null;
  private modelPromise: Promise<ObjectDetection> | null = null;
  private customModel: CustomMobileNet | null = null;
  private lastObjectCoordinates = new Map<string, StoredObjectCoordinate>();
  private lastObjectDetections: VisionDetection[] = [];
  private lastAprilTagDetections: AprilTagDetection[] = [];
  private scanSequence = 0;
  private syntheticDetectionProvider: ((width: number, height: number) => VisionDetection[]) | null = null;
  private syntheticAprilTagProvider: ((width: number, height: number) => AprilTagDetection[]) | null = null;

  constructor(
    private readonly getImage: () => HTMLImageElement | HTMLCanvasElement | null,
    private readonly getCanvas: () => HTMLCanvasElement | null,
    private readonly onModelStatus: (status: "off" | "loading" | "ready" | "error") => void,
    private readonly onDetections: (detections: VisionDetection[]) => void,
    private readonly onCustomModelStatus: (status: "off" | "loading" | "ready" | "error") => void,
    private readonly onCustomPredictions: (predictions: CustomPrediction[]) => void,
    private readonly onThreshold: (result: ThresholdResult) => void,
    private readonly onAprilTags: (detections: AprilTagDetection[]) => void,
    private readonly onScan: (event: VisionScanEvent) => void,
  ) {}

  setSyntheticDetectionProvider(
    provider: ((width: number, height: number) => VisionDetection[]) | null,
  ) {
    this.syntheticDetectionProvider = provider;
    this.lastObjectCoordinates.clear();
    this.lastObjectDetections = [];
    this.onDetections([]);
    this.onModelStatus(provider || this.model ? "ready" : "off");
  }

  setSyntheticAprilTagProvider(
    provider: ((width: number, height: number) => AprilTagDetection[]) | null,
  ) {
    this.syntheticAprilTagProvider = provider;
    this.lastAprilTagDetections = [];
    this.onAprilTags([]);
  }

  async scanThreshold(threshold = 60, invert = false, announceScan = true) {
    return this.scanned("threshold", announceScan, async () => {
      const frame = this.captureFrame(320);
      const result = analyzeThreshold(frame.data, frame.width, frame.height, threshold, invert);
      this.onThreshold(result);
      return result;
    });
  }

  async seesBinary(
    color: BinaryColor,
    threshold = 60,
    invert = false,
    minimumCoverage = 10,
  ) {
    const result = await this.scanThreshold(threshold, invert);
    const coverage = color === "white" ? result.whiteCoverage : result.blackCoverage;
    return coverage >= clampPercent(minimumCoverage);
  }

  async binaryCenter(color: BinaryColor, threshold = 60, invert = false) {
    const result = await this.scanThreshold(threshold, invert);
    return color === "white" ? result.centerWhite : !result.centerWhite;
  }

  async loadObjectModel() {
    if (this.model) return this.model;
    if (this.modelPromise) return this.modelPromise;
    if (window.location.protocol === "file:") {
      this.onModelStatus("error");
      throw new Error("Object detection needs the local server; see README.md.");
    }

    this.onModelStatus("loading");
    this.modelPromise = (async () => {
      await import("@tensorflow/tfjs");
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      const modelUrl = new URL("models/coco-ssd/model.json", document.baseURI).href;
      this.model = await cocoSsd.load({ base: "lite_mobilenet_v2", modelUrl });
      this.onModelStatus("ready");
      return this.model;
    })().catch((error) => {
      this.modelPromise = null;
      this.onModelStatus("error");
      throw error;
    });
    return this.modelPromise;
  }

  async detectObjects(minimumConfidence = 0.55, announceScan = true) {
    return this.scanned("object", announceScan, async () => {
      let normalized: VisionDetection[];
      if (this.syntheticDetectionProvider) {
        const frame = this.getReadyImage();
        const size = this.getSourceSize(frame);
        normalized = this.syntheticDetectionProvider(size.width, size.height)
          .filter((detection) => detection.score >= Number(minimumConfidence));
      } else {
        const model = await this.loadObjectModel();
        const frame = this.captureCanvas(420, true);
        const detections = await model.detect(frame, 10, minimumConfidence);
        normalized = detections.map((detection) => {
          const coordinate = detectionCenterCoordinate(detection.bbox, frame.width, frame.height);
          return {
            ...detection,
            frameWidth: frame.width,
            frameHeight: frame.height,
            centerX: coordinate.x,
            centerY: coordinate.y,
          };
        });
      }
      normalized.forEach((detection) => {
        this.lastObjectCoordinates.set(detection.class.trim().toLowerCase(), {
          x: detection.centerX,
          y: detection.centerY,
          confidence: detection.score,
        });
      });
      this.lastObjectDetections = normalized;
      this.onDetections(normalized);
      return normalized;
    });
  }

  async seesObject(label: string, minimumConfidence = 0.55) {
    const wanted = String(label).trim().toLowerCase();
    const detections = await this.detectObjects(minimumConfidence);
    return detections.some(
      (detection) => detection.class.toLowerCase() === wanted && detection.score >= Number(minimumConfidence),
    );
  }

  objectCoordinate(
    label: string,
    axis: "x" | "y",
    minimumConfidence = 0.55,
  ) {
    const wanted = String(label).trim().toLowerCase();
    const confidence = Number(minimumConfidence);
    const lastCoordinate = this.lastObjectCoordinates.get(wanted);
    return lastCoordinate && lastCoordinate.confidence >= confidence
      ? lastCoordinate[axis]
      : 0;
  }

  async scanAprilTags(announceScan = true) {
    return this.scanned("apriltag", announceScan, async () => {
      let detections: AprilTagDetection[];
      if (this.syntheticAprilTagProvider) {
        const frame = this.getReadyImage();
        const size = this.getSourceSize(frame);
        detections = this.syntheticAprilTagProvider(size.width, size.height);
      } else {
        const canvas = this.captureCanvas(520, true);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Camera analysis canvas is unavailable.");
        detections = detectAprilTags(
          context.getImageData(0, 0, canvas.width, canvas.height),
          canvas.width,
          canvas.height,
        );
      }
      this.lastAprilTagDetections = detections;
      this.onAprilTags(detections);
      return detections;
    });
  }

  async seesAprilTag(id: number | "any" | string = "any") {
    const detections = await this.scanAprilTags();
    if (String(id).toLowerCase() === "any") return detections.length > 0;
    const wanted = Math.round(Number(id));
    return detections.some((detection) => detection.id === wanted);
  }

  async centerOnAprilTag(
    drone: DroneController,
    id: number | "any" | string = "any",
    translationPower = 10,
    centerSlack = 5,
    angleSlack = 5,
    lostTagSearches = 3,
  ) {
    const wanted = String(id).toLowerCase() === "any" ? "any" : Math.round(Number(id));
    const safeTranslationPower = clampPercent(translationPower);
    const safeCenterSlack = Math.max(1, Math.min(35, Number(centerSlack) || 5));
    const safeAngleSlack = Math.max(1, Math.min(45, Number(angleSlack) || 5));
    const safeLostTagSearches = Math.max(1, Math.min(20, Math.round(Number(lostTagSearches) || 3)));
    const deadline = performance.now() + 30_000;
    let misses = 0;

    while (!drone.cancelRunFlag && performance.now() < deadline) {
      const detections = await this.scanAprilTags(true);
      const candidates = wanted === "any"
        ? detections
        : detections.filter((detection) => detection.id === wanted);
      const target = [...candidates].sort(
        (left, right) => Math.hypot(left.centerX, left.centerY) - Math.hypot(right.centerX, right.centerY),
      )[0];
      if (!target) {
        misses += 1;
        if (misses >= safeLostTagSearches) {
          drone.reset();
          return false;
        }
        await drone.wait(0.45);
        continue;
      }
      misses = 0;
      const horizontalError = target.centerX;
      const verticalError = target.centerY;
      if (Math.abs(horizontalError) > safeCenterSlack || Math.abs(verticalError) > safeCenterSlack) {
        if (Math.abs(horizontalError) >= Math.abs(verticalError)) {
          drone.setAxis("roll", horizontalError > 0 ? safeTranslationPower : -safeTranslationPower);
        } else {
          drone.setAxis("pitch", verticalError > 0 ? safeTranslationPower : -safeTranslationPower);
        }
        await drone.wait(0.3);
        drone.reset();
        await drone.wait(0.65);
        continue;
      }
      if (Math.abs(target.yaw) > safeAngleSlack) {
        await drone.rotate(
          Math.abs(target.yaw),
          target.yaw > 0 ? "clockwise" : "counterclockwise",
        );
        continue;
      }
      drone.reset();
      return true;
    }
    drone.reset();
    return false;
  }

  async loadCustomModel(modelFile: File, weightsFile: File, metadataFile: File) {
    this.onCustomModelStatus("loading");
    try {
      await import("@tensorflow/tfjs");
      const teachableMachine = await import("@teachablemachine/image");
      this.customModel?.dispose();
      this.customModel = await teachableMachine.loadFromFiles(
        modelFile,
        weightsFile,
        metadataFile,
      );
      this.onCustomPredictions([]);
      this.onCustomModelStatus("ready");
      return this.customModel.getClassLabels();
    } catch (error) {
      this.customModel = null;
      this.onCustomModelStatus("error");
      throw error;
    }
  }

  async classifyCustomModel(announceScan = true) {
    return this.scanned("custom", announceScan, async () => {
      if (!this.customModel) {
        throw new Error(
          "Load a standard Teachable Machine image model in Vision Testing first.",
        );
      }
      const frame = this.captureCanvas(420, true);
      const predictions = await this.customModel.predict(frame, false);
      this.onCustomPredictions(predictions);
      return predictions;
    });
  }

  async seesCustomLabel(label: string, minimumConfidence = 0.75) {
    const wanted = String(label).trim().toLowerCase();
    const predictions = await this.classifyCustomModel();
    return predictions.some(
      (prediction) =>
        prediction.className.trim().toLowerCase() === wanted &&
        prediction.probability >= Number(minimumConfidence),
    );
  }

  dispose() {
    this.model?.dispose();
    this.customModel?.dispose();
    this.model = null;
    this.modelPromise = null;
    this.customModel = null;
  }

  private async scanned<T>(
    kind: VisionScanKind,
    announceScan: boolean,
    operation: () => Promise<T>,
  ) {
    if (!announceScan) return operation();
    const sequence = ++this.scanSequence;
    const startedAt = performance.now();
    this.onScan({ kind, phase: "start", sequence });
    try {
      const result = await operation();
      const remainingAnimation = 540 - (performance.now() - startedAt);
      if (remainingAnimation > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, remainingAnimation));
      }
      this.onScan({ kind, phase: "complete", sequence });
      return result;
    } catch (error) {
      this.onScan({ kind, phase: "error", sequence });
      throw error;
    }
  }

  private captureFrame(maxWidth: number) {
    const canvas = this.captureCanvas(maxWidth);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Camera analysis canvas is unavailable.");
    try {
      return context.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      throw new Error(
        "The camera is visible, but this browser blocked pixel access. Start the local server so the camera proxy can enable CV blocks.",
      );
    }
  }

  private getReadyImage() {
    const image = this.getImage();
    if (!image) {
      throw new Error("Connect the camera feed before using vision blocks.");
    }
    const { width, height } = this.getSourceSize(image);
    if (width === 0 || height === 0) throw new Error("Connect the camera feed before using vision blocks.");
    return image;
  }

  private getSourceSize(image: HTMLImageElement | HTMLCanvasElement) {
    return image instanceof HTMLImageElement
      ? { width: image.naturalWidth, height: image.naturalHeight }
      : { width: image.width, height: image.height };
  }

  private captureCanvas(maxWidth: number, isolated = false) {
    const image = this.getReadyImage();
    const source = this.getSourceSize(image);
    const canvas = isolated ? document.createElement("canvas") : this.getCanvas();
    if (!canvas) throw new Error("Camera analysis canvas is unavailable.");
    const width = Math.min(maxWidth, source.width);
    const height = Math.max(1, Math.round((source.height / source.width) * width));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Camera analysis canvas is unavailable.");
    context.drawImage(image, 0, 0, width, height);
    return canvas;
  }
}
