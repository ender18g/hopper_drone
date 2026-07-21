import type { DetectedObject, ObjectDetection } from "@tensorflow-models/coco-ssd";
import type { CustomMobileNet } from "@teachablemachine/image";

export type ColorProfile = {
  rMin: number;
  rMax: number;
  gMin: number;
  gMax: number;
  bMin: number;
  bMax: number;
};

export type ColorProfiles = Record<"red" | "green" | "blue", ColorProfile>;

export type RgbPixel = {
  red: number;
  green: number;
  blue: number;
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

export const DEFAULT_COLOR_PROFILES: ColorProfiles = {
  red: { rMin: 150, rMax: 255, gMin: 0, gMax: 120, bMin: 0, bMax: 120 },
  green: { rMin: 0, rMax: 130, gMin: 120, gMax: 255, bMin: 0, bMax: 140 },
  blue: { rMin: 0, rMax: 130, gMin: 40, gMax: 170, bMin: 130, bMax: 255 },
};

const clampCoordinate = (value: number) => Math.max(-100, Math.min(100, value));

export const pixelMatchesProfile = (pixel: RgbPixel, profile: ColorProfile) =>
  pixel.red >= profile.rMin &&
  pixel.red <= profile.rMax &&
  pixel.green >= profile.gMin &&
  pixel.green <= profile.gMax &&
  pixel.blue >= profile.bMin &&
  pixel.blue <= profile.bMax;

export const calculateColorCoverage = (data: Uint8ClampedArray, profile: ColorProfile) => {
  let matches = 0;
  const total = data.length / 4;
  for (let index = 0; index < data.length; index += 4) {
    if (
      pixelMatchesProfile(
        { red: data[index], green: data[index + 1], blue: data[index + 2] },
        profile,
      )
    ) {
      matches += 1;
    }
  }
  return total === 0 ? 0 : (matches / total) * 100;
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
  private profiles: ColorProfiles = DEFAULT_COLOR_PROFILES;
  private model: ObjectDetection | null = null;
  private modelPromise: Promise<ObjectDetection> | null = null;
  private customModel: CustomMobileNet | null = null;
  private lastObjectCoordinates = new Map<string, StoredObjectCoordinate>();
  private lastDetectionScanAt = Number.NEGATIVE_INFINITY;
  private lastDetectionMinimumConfidence = 1;
  private syntheticDetectionProvider: ((width: number, height: number) => VisionDetection[]) | null = null;

  constructor(
    private readonly getImage: () => HTMLImageElement | HTMLCanvasElement | null,
    private readonly getCanvas: () => HTMLCanvasElement | null,
    private readonly onModelStatus: (status: "off" | "loading" | "ready" | "error") => void,
    private readonly onDetections: (detections: VisionDetection[]) => void,
    private readonly onCustomModelStatus: (status: "off" | "loading" | "ready" | "error") => void,
    private readonly onCustomPredictions: (predictions: CustomPrediction[]) => void,
  ) {}

  setProfiles(profiles: ColorProfiles) {
    this.profiles = profiles;
  }

  setSyntheticDetectionProvider(
    provider: ((width: number, height: number) => VisionDetection[]) | null,
  ) {
    this.syntheticDetectionProvider = provider;
    this.lastObjectCoordinates.clear();
    this.onDetections([]);
    this.onModelStatus(provider || this.model ? "ready" : "off");
  }

  colorCoverage(profileName: keyof ColorProfiles) {
    const { data } = this.captureFrame(180);
    return calculateColorCoverage(data, this.profiles[profileName]);
  }

  sampleCenterPixel(): RgbPixel {
    const image = this.getReadyImage();
    const { width, height } = this.getSourceSize(image);
    const canvas = this.getCanvas();
    if (!canvas) throw new Error("Camera analysis canvas is unavailable.");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Camera analysis canvas is unavailable.");
    context.imageSmoothingEnabled = false;
    const sourceX = Math.floor(width / 2);
    const sourceY = Math.floor(height / 2);
    context.drawImage(image, sourceX, sourceY, 1, 1, 0, 0, 1, 1);
    try {
      const data = context.getImageData(0, 0, 1, 1).data;
      return { red: data[0], green: data[1], blue: data[2] };
    } catch {
      throw new Error(
        "The camera is visible, but this browser blocked pixel access. Start the local server so the camera proxy can enable CV blocks.",
      );
    }
  }

  async seesColor(profileName: keyof ColorProfiles, minimumCoverage = 12) {
    return this.colorCoverage(profileName) >= Number(minimumCoverage);
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

  async detectObjects(minimumConfidence = 0.55) {
    if (this.syntheticDetectionProvider) {
      const frame = this.getReadyImage();
      const size = this.getSourceSize(frame);
      const detections = this.syntheticDetectionProvider(size.width, size.height)
        .filter((detection) => detection.score >= Number(minimumConfidence));
      detections.forEach((detection) => {
        this.lastObjectCoordinates.set(detection.class.trim().toLowerCase(), {
          x: detection.centerX,
          y: detection.centerY,
          confidence: detection.score,
        });
      });
      this.lastDetectionScanAt = performance.now();
      this.lastDetectionMinimumConfidence = minimumConfidence;
      this.onDetections(detections);
      return detections;
    }
    const model = await this.loadObjectModel();
    const frame = this.captureCanvas(420, true);
    const detections = await model.detect(frame, 10, minimumConfidence);
    const normalized = detections.map((detection) => {
      const coordinate = detectionCenterCoordinate(detection.bbox, frame.width, frame.height);
      this.lastObjectCoordinates.set(detection.class.trim().toLowerCase(), {
        ...coordinate,
        confidence: detection.score,
      });
      return {
        ...detection,
        frameWidth: frame.width,
        frameHeight: frame.height,
        centerX: coordinate.x,
        centerY: coordinate.y,
      };
    });
    this.lastDetectionScanAt = performance.now();
    this.lastDetectionMinimumConfidence = minimumConfidence;
    this.onDetections(normalized);
    return normalized;
  }

  async seesObject(label: string, minimumConfidence = 0.55) {
    const wanted = String(label).trim().toLowerCase();
    const detections = await this.detectObjects(Number(minimumConfidence));
    return detections.some((detection) => detection.class.toLowerCase() === wanted);
  }

  async objectCoordinate(
    label: string,
    axis: "x" | "y",
    minimumConfidence = 0.55,
  ) {
    const wanted = String(label).trim().toLowerCase();
    const confidence = Number(minimumConfidence);
    if (
      performance.now() - this.lastDetectionScanAt > 350 ||
      confidence > this.lastDetectionMinimumConfidence
    ) {
      await this.detectObjects(Number(minimumConfidence));
    }
    const lastCoordinate = this.lastObjectCoordinates.get(wanted);
    return lastCoordinate && lastCoordinate.confidence >= confidence
      ? lastCoordinate[axis]
      : 0;
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

  async classifyCustomModel() {
    if (!this.customModel) {
      throw new Error(
        "Load a standard Teachable Machine image model in Telemetry first.",
      );
    }
    const frame = this.captureCanvas(420, true);
    const predictions = await this.customModel.predict(frame, false);
    this.onCustomPredictions(predictions);
    return predictions;
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
