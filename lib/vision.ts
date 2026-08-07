import type { DetectedObject, ObjectDetection } from "@tensorflow-models/coco-ssd";
import type { CustomMobileNet } from "@teachablemachine/image";
import type { IOHandler, ModelJSON } from "@tensorflow/tfjs-core/dist/io/types";
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
  binaryData: Uint8ClampedArray<ArrayBuffer>;
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

export type BinaryCentroid = ObjectCoordinate & {
  coverage: number;
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

export type CapturedPhoto = {
  blob: Blob;
  width: number;
  height: number;
};

const clampCoordinate = (value: number) => Math.max(-100, Math.min(100, value));
const clampPercent = (value: number) => Math.max(0, Math.min(100, Number(value) || 0));
const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const opaqueBlack = littleEndian ? 0xff000000 : 0x000000ff;
const localModelHandlers = new Map<string, IOHandler>();
let localModelRouterRegistered = false;
const bundledModelShardSizes = new Map([
  ["group1-shard1of5", 4_194_304],
  ["group1-shard2of5", 4_194_304],
  ["group1-shard3of5", 4_194_304],
  ["group1-shard4of5", 4_194_304],
  ["group1-shard5of5", 1_257_312],
]);

class BundledModelAssetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundledModelAssetError";
  }
}

const loadBundledAsset = (
  url: string,
  responseType: "text" | "arraybuffer",
): Promise<string | ArrayBuffer> => new Promise((resolve, reject) => {
  const request = new XMLHttpRequest();
  request.open("GET", url, true);
  request.overrideMimeType(
    responseType === "arraybuffer" ? "application/octet-stream" : "application/json",
  );
  request.responseType = responseType;
  request.timeout = 120_000;
  request.onload = () => {
    if (request.status !== 0 && (request.status < 200 || request.status >= 300)) {
      reject(new BundledModelAssetError(
        `Bundled model asset ${new URL(url).pathname} returned ${request.status}.`,
      ));
      return;
    }
    if (responseType === "text") {
      resolve(request.responseText);
      return;
    }
    if (request.response instanceof ArrayBuffer) {
      const assetName = new URL(url).pathname.split("/").pop() ?? "";
      const expectedSize = bundledModelShardSizes.get(assetName.replace(/\.bin$/, ""));
      if (expectedSize !== undefined && request.response.byteLength !== expectedSize) {
        reject(new BundledModelAssetError(
          `Bundled model asset ${assetName} was ${request.response.byteLength} bytes; expected ${expectedSize}.`,
        ));
        return;
      }
      resolve(request.response);
      return;
    }
    reject(new BundledModelAssetError(
      `Bundled model asset ${new URL(url).pathname} returned no binary data.`,
    ));
  };
  request.onerror = () => reject(new BundledModelAssetError(
    `Could not read bundled model asset ${new URL(url).pathname}.`,
  ));
  request.ontimeout = () => reject(new BundledModelAssetError(
    `Timed out reading bundled model asset ${new URL(url).pathname}.`,
  ));
  request.send();
});

type TensorFlowGraphNode = {
  name?: string;
  op?: string;
  input?: string[];
  attr?: Record<string, unknown>;
};

const ipadDynamicBatchSlice = /^(?:Preprocessor\/map\/TensorArrayUnstack|BoxPredictor_[0-5]|Postprocessor)\/strided_slice$/;
const bundledModelShardName = /^group1-shard[1-5]of5$/;

const stabilizeSingleFrameModelForIPad = (modelJson: ModelJSON) => {
  const topology = modelJson.modelTopology as { node?: TensorFlowGraphNode[] } | undefined;
  let replacements = 0;
  topology?.node?.forEach((node) => {
    if (node.op !== "StridedSlice" || !ipadDynamicBatchSlice.test(node.name ?? "")) return;
    const originalInputs = node.input ?? [];
    // Every Hopper inference has a single image. The original graph dynamically
    // slices Shape(...)[0] at these eight nodes; iOS 26 can decode that index as
    // an invalid 64-bit value. Reuse the graph's existing scalar int32 `1`
    // through Identity so the converter keeps its normal frozen-weight path.
    // Retain the replaced data inputs as control dependencies. Without them,
    // their now-dangling Shape/Const nodes become additional inferred model
    // outputs and COCO-SSD reads those constants instead of scores and boxes.
    node.op = "Identity";
    node.input = [
      "Postprocessor/Tile/multiples/1",
      ...originalInputs.map(
        (input) => `^${input.replace(/^\^/, "").replace(/:\d+$/, "")}`,
      ),
    ];
    node.attr = { T: { type: 3 } };
    replacements += 1;
  });
  if (replacements !== 8) {
    throw new BundledModelAssetError(
      `Bundled object model expected 8 iPad batch slices but found ${replacements}.`,
    );
  }
};

const routeBundledShardsForIPad = (modelJson: ModelJSON) => {
  let replacements = 0;
  modelJson.weightsManifest.forEach((group) => {
    group.paths = group.paths.map((path) => {
      if (!bundledModelShardName.test(path)) return path;
      replacements += 1;
      // Capacitor treats extensionless URLs as client-side routes and returns
      // index.html even when the extensionless asset exists in the app bundle.
      // The iPad package contains byte-identical .bin aliases for these files.
      return `${path}.bin`;
    });
  });
  if (replacements !== 5) {
    throw new BundledModelAssetError(
      `Bundled object model expected 5 weight shards but found ${replacements}.`,
    );
  }
};

const createBundledModelHandler = (
  tf: typeof import("@tensorflow/tfjs"),
  modelUrl: string,
): IOHandler => ({
  load: async () => {
    const modelSource = await loadBundledAsset(modelUrl, "text");
    let modelJson: ModelJSON;
    try {
      modelJson = JSON.parse(String(modelSource)) as ModelJSON;
    } catch {
      throw new BundledModelAssetError("The bundled object model JSON is invalid.");
    }
    stabilizeSingleFrameModelForIPad(modelJson);
    routeBundledShardsForIPad(modelJson);
    return tf.io.getModelArtifactsForJSON(modelJson, async (manifest) => {
      const shardUrls = manifest.flatMap((group) => group.paths)
        .map((path) => new URL(path, modelUrl).href);
      const shardBuffers = await Promise.all(
        shardUrls.map((url) => loadBundledAsset(url, "arraybuffer")),
      );
      return [
        tf.io.getWeightSpecs(manifest),
        shardBuffers as ArrayBuffer[],
      ];
    });
  },
});

const ensureBundledModelHandler = (
  tf: typeof import("@tensorflow/tfjs"),
  modelUrl: string,
) => {
  if (!localModelHandlers.has(modelUrl)) {
    localModelHandlers.set(modelUrl, createBundledModelHandler(tf, modelUrl));
  }
  if (!localModelRouterRegistered) {
    tf.io.registerLoadRouter((url) => {
      if (typeof url !== "string") return null as never;
      return localModelHandlers.get(url) ?? null as never;
    });
    localModelRouterRegistered = true;
  }
};

export const normalizedCoordinateToPixel = (
  coordinate: ObjectCoordinate,
  frameWidth: number,
  frameHeight: number,
) => ({
  x: Math.round(((clampCoordinate(Number(coordinate.x) || 0) + 100) / 200) * Math.max(0, frameWidth - 1)),
  y: Math.round(((100 - clampCoordinate(Number(coordinate.y) || 0)) / 200) * Math.max(0, frameHeight - 1)),
});

export const analyzeThreshold = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  thresholdPercent = 60,
  invert = false,
): ThresholdResult => {
  const safeThreshold = clampPercent(thresholdPercent);
  // Integer luminance keeps this hot loop mathematically equivalent to the
  // documented Rec. 709 calculation without doing four typed-array writes per
  // pixel. All supported browsers expose aligned RGBA ImageData buffers.
  const cutoff = safeThreshold * 25_500;
  const binaryData = new Uint8ClampedArray(data.length);
  const packedBinary = new Uint32Array(binaryData.buffer);
  let whitePixels = 0;
  for (let pixel = 0, index = 0; index < data.length; pixel += 1, index += 4) {
    const luminance = data[index] * 2126 + data[index + 1] * 7152 + data[index + 2] * 722;
    const white = (luminance >= cutoff) !== Boolean(invert);
    if (white) whitePixels += 1;
    packedBinary[pixel] = white ? 0xffffffff : opaqueBlack;
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

export const binaryCentroid = (
  result: ThresholdResult,
  color: BinaryColor,
): BinaryCentroid | null => {
  let pixelCount = 0;
  let xTotal = 0;
  let yTotal = 0;
  const wantsWhite = color === "white";
  for (let y = 0; y < result.frameHeight; y += 1) {
    for (let x = 0; x < result.frameWidth; x += 1) {
      const pixelIsWhite = result.binaryData[(y * result.frameWidth + x) * 4] === 255;
      if (pixelIsWhite !== wantsWhite) continue;
      pixelCount += 1;
      xTotal += x;
      yTotal += y;
    }
  }
  const total = result.frameWidth * result.frameHeight;
  if (pixelCount === 0 || total === 0) return null;
  const horizontalSpan = Math.max(1, result.frameWidth - 1);
  const verticalSpan = Math.max(1, result.frameHeight - 1);
  return {
    x: Math.round(clampCoordinate((xTotal / pixelCount / horizontalSpan - 0.5) * 200) * 10) / 10,
    y: Math.round(clampCoordinate((0.5 - yTotal / pixelCount / verticalSpan) * 200) * 10) / 10,
    coverage: (pixelCount / total) * 100,
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
    private readonly onLog: (message: string) => void = () => undefined,
    private readonly onModelError: (message: string | null) => void = () => undefined,
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

  async scanThreshold(
    threshold = 60,
    invert = false,
    announceScan = true,
    publishResult = true,
  ) {
    return this.scanned("threshold", announceScan, async () => {
      const frame = this.captureFrame(320);
      const result = analyzeThreshold(frame.data, frame.width, frame.height, threshold, invert);
      if (publishResult) this.onThreshold(result);
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

  async binaryAt(
    color: BinaryColor,
    x = 0,
    y = 0,
    threshold = 60,
    invert = false,
  ) {
    const result = await this.scanThreshold(threshold, invert);
    const pixel = normalizedCoordinateToPixel(
      { x, y },
      result.frameWidth,
      result.frameHeight,
    );
    const index = (pixel.y * result.frameWidth + pixel.x) * 4;
    const pixelIsWhite = result.binaryData[index] === 255;
    return color === "white" ? pixelIsWhite : !pixelIsWhite;
  }

  /** Compatibility alias for projects saved before coordinate sampling was added. */
  async binaryCenter(color: BinaryColor, threshold = 60, invert = false) {
    return this.binaryAt(color, 0, 0, threshold, invert);
  }

  async centerOnBinary(
    drone: DroneController,
    color: BinaryColor,
    threshold = 60,
    minimumCoverage = 10,
    translationPower = 10,
    centerSlack = 5,
    lostSearches = 3,
    rescanDelay = 0.5,
  ) {
    const wanted: BinaryColor = color === "black" ? "black" : "white";
    const safeThreshold = clampPercent(threshold);
    const safeMinimumCoverage = clampPercent(minimumCoverage);
    const safeTranslationPower = clampPercent(translationPower);
    const safeCenterSlack = Math.max(1, Math.min(35, Number(centerSlack) || 5));
    const safeLostSearches = Math.max(1, Math.min(20, Math.round(Number(lostSearches) || 3)));
    const safeRescanDelay = Math.max(0, Math.min(5, Number(rescanDelay) || 0));
    const deadline = performance.now() + 30_000;
    let misses = 0;

    this.onLog(`Binary centering: looking for ${wanted} at threshold ${safeThreshold}%.`);
    while (!drone.cancelRunFlag && performance.now() < deadline) {
      const result = await this.scanThreshold(safeThreshold, false, true);
      const target = binaryCentroid(result, wanted);
      if (!target || target.coverage < safeMinimumCoverage) {
        misses += 1;
        this.onLog(
          `Binary centering: ${wanted} covers ${target?.coverage.toFixed(1) ?? "0.0"}% of frame; need ${safeMinimumCoverage}% — search ${misses} of ${safeLostSearches}.`,
        );
        if (misses >= safeLostSearches) {
          drone.reset();
          this.onLog(`Binary centering: gave up after ${safeLostSearches} lost-target scans.`);
          return false;
        }
        await drone.wait(0.45);
        continue;
      }

      misses = 0;
      const horizontalError = target.x;
      const verticalError = target.y;
      this.onLog(
        `Binary centering: ${wanted} centroid is at X ${horizontalError}%, Y ${verticalError}% (${target.coverage.toFixed(1)}% coverage).`,
      );
      if (
        Math.abs(horizontalError) <= safeCenterSlack &&
        Math.abs(verticalError) <= safeCenterSlack
      ) {
        drone.reset();
        this.onLog(`Binary centering: ${wanted} target is centered; yaw was not changed.`);
        return true;
      }

      if (Math.abs(horizontalError) >= Math.abs(verticalError)) {
        drone.setAxis("roll", horizontalError > 0 ? safeTranslationPower : -safeTranslationPower);
      } else {
        drone.setAxis("pitch", verticalError > 0 ? safeTranslationPower : -safeTranslationPower);
      }
      await drone.wait(0.3);
      drone.reset();
      await drone.wait(safeRescanDelay);
    }

    drone.reset();
    this.onLog(
      drone.cancelRunFlag
        ? "Binary centering: stopped."
        : "Binary centering: timed out after 30 seconds.",
    );
    return false;
  }

  async loadObjectModel() {
    if (this.model) return this.model;
    if (this.modelPromise) return this.modelPromise;
    if (window.location.protocol === "file:") {
      this.onModelStatus("error");
      throw new Error("Object detection needs the local server; see README.md.");
    }

    this.onModelStatus("loading");
    this.onModelError(null);
    this.modelPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      const modelUrl = new URL("models/coco-ssd/model.json", document.baseURI).href;
      const usesBundledIPadModel = !/^https?:\/\//i.test(modelUrl);

      // WKWebView serves Capacitor assets through a custom URL scheme. WebKit
      // can display those assets but does not reliably send fetch() through a
      // WKURLSchemeHandler, so load the packaged JSON and shards with XHR. The
      // iPad also selects CPU before the graph is loaded: if WebGL rejects a
      // shape, retrying the same graph after switching backends can leave the
      // shared TensorFlow engine with corrupted shape metadata.
      if (usesBundledIPadModel) {
        ensureBundledModelHandler(tf, modelUrl);
        if (!await tf.setBackend("cpu")) {
          throw new Error("The TensorFlow CPU backend could not be initialized on this iPad.");
        }
      }

      await tf.ready();
      const firstBackend = tf.getBackend();
      this.onLog(`Object model: loading bundled COCO-SSD on ${firstBackend}.`);
      try {
        this.model = await cocoSsd.load({ base: "lite_mobilenet_v2", modelUrl });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          !usesBundledIPadModel
          &&
          firstBackend !== "cpu"
          && !/bundled model asset/i.test(message)
          && await tf.setBackend("cpu")
        ) {
          await tf.ready();
          this.onLog(`Object model: ${firstBackend} failed; retrying on CPU.`);
          this.model = await cocoSsd.load({ base: "lite_mobilenet_v2", modelUrl });
        } else {
          throw new Error(`COCO-SSD ${firstBackend} initialization failed: ${message}`);
        }
      }
      this.onModelStatus("ready");
      this.onModelError(null);
      this.onLog(`Object model ready on ${tf.getBackend()}.`);
      return this.model;
    })().catch((error) => {
      this.modelPromise = null;
      this.onModelStatus("error");
      const message = error instanceof Error ? error.message : String(error);
      this.onModelError(message);
      this.onLog(`Object model unavailable: ${message}`);
      throw error;
    });
    return this.modelPromise;
  }

  async detectObjects(minimumConfidence = 0.55, announceScan = true) {
    try {
      const detections = await this.scanned("object", announceScan, async () => {
        let normalized: VisionDetection[];
        if (this.syntheticDetectionProvider) {
          const frame = this.getReadyImage();
          const size = this.getSourceSize(frame);
          normalized = this.syntheticDetectionProvider(size.width, size.height)
            .filter((detection) => detection.score >= Number(minimumConfidence));
        } else {
          const model = await this.loadObjectModel();
          const tf = await import("@tensorflow/tfjs");
          const frame = this.createObjectDetectionTensor(tf);
          try {
            const detectedObjects = await model.detect(frame.tensor, 10, minimumConfidence);
            normalized = detectedObjects.map((detection) => {
              const coordinate = detectionCenterCoordinate(
                detection.bbox,
                frame.width,
                frame.height,
              );
              return {
                ...detection,
                frameWidth: frame.width,
                frameHeight: frame.height,
                centerX: coordinate.x,
                centerY: coordinate.y,
              };
            });
          } finally {
            frame.tensor.dispose();
          }
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
      this.onModelError(null);
      return detections;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.onModelError(`Object scan failed: ${message}`);
      throw error;
    }
  }

  async seesObject(label: string, minimumConfidence = 0.55) {
    const wanted = String(label).trim().toLowerCase();
    const detections = await this.detectObjects(minimumConfidence);
    return detections.some(
      (detection) => detection.class.toLowerCase() === wanted && detection.score >= Number(minimumConfidence),
    );
  }

  async seesAnyObject(minimumConfidence = 0.55) {
    const confidence = Number(minimumConfidence);
    const detections = await this.detectObjects(confidence);
    return detections.some((detection) => detection.score >= confidence);
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

  async centerOnObject(
    drone: DroneController,
    label: string,
    translationPower = 10,
    minimumConfidence = 0.55,
    centerSlack = 5,
    lostObjectSearches = 3,
    rescanDelay = 0.5,
  ) {
    const wanted = String(label).trim().toLowerCase();
    const safeTranslationPower = clampPercent(translationPower);
    const safeConfidence = Math.max(0.01, Math.min(1, Number(minimumConfidence) || 0.55));
    const safeCenterSlack = Math.max(1, Math.min(35, Number(centerSlack) || 5));
    const safeLostObjectSearches = Math.max(
      1,
      Math.min(20, Math.round(Number(lostObjectSearches) || 3)),
    );
    const safeRescanDelay = Math.max(0, Math.min(5, Number(rescanDelay) || 0));
    const deadline = performance.now() + 30_000;
    let misses = 0;
    const signed = (value: number) => {
      const rounded = Math.round(value * 10) / 10;
      return rounded > 0 ? `+${rounded}` : String(rounded);
    };

    if (!wanted) {
      this.onLog("Object centering: enter an object detection label.");
      return false;
    }
    this.onLog(`Object centering: looking for “${wanted}”.`);

    while (!drone.cancelRunFlag && performance.now() < deadline) {
      const detections = await this.detectObjects(safeConfidence, true);
      const target = detections
        .filter(
          (detection) =>
            detection.class.trim().toLowerCase() === wanted &&
            detection.score >= safeConfidence,
        )
        .sort(
          (left, right) =>
            Math.hypot(left.centerX, left.centerY) -
            Math.hypot(right.centerX, right.centerY),
        )[0];
      if (!target) {
        misses += 1;
        this.onLog(
          `Object centering: “${wanted}” not detected — search ${misses} of ${safeLostObjectSearches}.`,
        );
        if (misses >= safeLostObjectSearches) {
          drone.reset();
          this.onLog(
            `Object centering: gave up after ${safeLostObjectSearches} lost-object searches.`,
          );
          return false;
        }
        await drone.wait(0.45);
        continue;
      }

      misses = 0;
      const horizontalError = target.centerX;
      const verticalError = target.centerY;
      this.onLog(
        `Object centering: ${target.class} detected at X ${signed(horizontalError)}%, Y ${signed(verticalError)}%.`,
      );
      if (
        Math.abs(horizontalError) <= safeCenterSlack &&
        Math.abs(verticalError) <= safeCenterSlack
      ) {
        drone.reset();
        this.onLog(`Object centering: ${target.class} is centered; yaw was not changed.`);
        return true;
      }

      if (Math.abs(horizontalError) >= Math.abs(verticalError)) {
        const direction = horizontalError > 0 ? "right" : "left";
        this.onLog(`Object centering: moving ${direction} at ${safeTranslationPower}% power.`);
        drone.setAxis(
          "roll",
          direction === "right" ? safeTranslationPower : -safeTranslationPower,
        );
      } else {
        const direction = verticalError > 0 ? "forward" : "backward";
        this.onLog(`Object centering: moving ${direction} at ${safeTranslationPower}% power.`);
        drone.setAxis(
          "pitch",
          direction === "forward" ? safeTranslationPower : -safeTranslationPower,
        );
      }
      await drone.wait(0.3);
      drone.reset();
      this.onLog(
        `Object centering: waiting ${safeRescanDelay.toFixed(1)} s for a level image before rescanning.`,
      );
      await drone.wait(safeRescanDelay);
    }

    drone.reset();
    this.onLog(
      drone.cancelRunFlag
        ? "Object centering: stopped."
        : "Object centering: timed out after 30 seconds.",
    );
    return false;
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
    rescanDelay = 0.5,
  ) {
    const wanted = String(id).toLowerCase() === "any" ? "any" : Math.round(Number(id));
    const safeTranslationPower = clampPercent(translationPower);
    const safeCenterSlack = Math.max(1, Math.min(35, Number(centerSlack) || 5));
    const safeAngleSlack = Math.max(1, Math.min(45, Number(angleSlack) || 5));
    const safeLostTagSearches = Math.max(1, Math.min(20, Math.round(Number(lostTagSearches) || 3)));
    const safeRescanDelay = Math.max(0, Math.min(5, Number(rescanDelay) || 0));
    const deadline = performance.now() + 30_000;
    let misses = 0;
    const requestedTag = wanted === "any" ? "any AprilTag" : `AprilTag ${wanted}`;
    const signed = (value: number) => {
      const rounded = Math.round(value * 10) / 10;
      return rounded > 0 ? `+${rounded}` : String(rounded);
    };

    this.onLog(`AprilTag centering: looking for ${requestedTag}.`);

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
        this.onLog(
          `AprilTag centering: ${requestedTag} not detected — search ${misses} of ${safeLostTagSearches}.`,
        );
        if (misses >= safeLostTagSearches) {
          drone.reset();
          this.onLog(`AprilTag centering: gave up after ${safeLostTagSearches} lost-tag searches.`);
          return false;
        }
        await drone.wait(0.45);
        continue;
      }
      misses = 0;
      const horizontalError = target.centerX;
      const verticalError = target.centerY;
      this.onLog(
        `AprilTag centering: tag ${target.id} detected at X ${signed(horizontalError)}%, Y ${signed(verticalError)}%, yaw ${signed(target.yaw)}°.`,
      );
      if (Math.abs(horizontalError) > safeCenterSlack || Math.abs(verticalError) > safeCenterSlack) {
        if (Math.abs(horizontalError) >= Math.abs(verticalError)) {
          const direction = horizontalError > 0 ? "right" : "left";
          this.onLog(`AprilTag centering: moving ${direction} at ${safeTranslationPower}% power.`);
          drone.setAxis("roll", direction === "right" ? safeTranslationPower : -safeTranslationPower);
        } else {
          const direction = verticalError > 0 ? "forward" : "backward";
          this.onLog(`AprilTag centering: moving ${direction} at ${safeTranslationPower}% power.`);
          drone.setAxis("pitch", direction === "forward" ? safeTranslationPower : -safeTranslationPower);
        }
        await drone.wait(0.3);
        drone.reset();
        this.onLog(
          `AprilTag centering: waiting ${safeRescanDelay.toFixed(1)} s for a level image before rescanning.`,
        );
        await drone.wait(safeRescanDelay);
        continue;
      }
      if (Math.abs(target.yaw) > safeAngleSlack) {
        const yawDirection = target.yaw > 0 ? "clockwise" : "counterclockwise";
        this.onLog(
          `AprilTag centering: yawing ${yawDirection} ${Math.round(Math.abs(target.yaw) * 10) / 10}°.`,
        );
        await drone.rotate(
          Math.abs(target.yaw),
          yawDirection,
        );
        continue;
      }
      drone.reset();
      this.onLog(`AprilTag centering: tag ${target.id} is centered and aligned.`);
      return true;
    }
    drone.reset();
    this.onLog(
      drone.cancelRunFlag
        ? "AprilTag centering: stopped."
        : "AprilTag centering: timed out after 30 seconds.",
    );
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

  async capturePhoto(maxWidth = 960): Promise<CapturedPhoto> {
    const safeMaxWidth = Math.max(1, Math.round(Number(maxWidth) || 960));
    let canvas: HTMLCanvasElement;
    try {
      canvas = this.captureCanvas(safeMaxWidth, true);
    } catch (error) {
      if (
        error instanceof Error
        && error.message === "Connect the camera feed before using vision blocks."
      ) {
        throw new Error("Connect the camera feed before taking and storing a photo.");
      }
      throw error;
    }

    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (encoded) => {
            if (encoded) resolve(encoded);
            else reject(new Error("The current camera frame could not be encoded. Try again."));
          },
          "image/jpeg",
          0.9,
        );
      });
      return { blob, width: canvas.width, height: canvas.height };
    } catch (error) {
      if (
        (error instanceof DOMException && error.name === "SecurityError")
        || (error instanceof Error && error.name === "SecurityError")
      ) {
        throw new Error(
          "The camera is visible, but this browser blocked saving its pixels. Use the desktop/local app or connect through the camera proxy.",
        );
      }
      throw error;
    }
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

  private createObjectDetectionTensor(tf: typeof import("@tensorflow/tfjs")) {
    const image = this.getReadyImage();
    const inputSize = 300;
    const canvas = document.createElement("canvas");
    canvas.width = inputSize;
    canvas.height = inputSize;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Camera analysis canvas is unavailable.");
    context.drawImage(image, 0, 0, inputSize, inputSize);
    const rgba = context.getImageData(0, 0, inputSize, inputSize).data;
    const rgb = new Int32Array(inputSize * inputSize * 3);
    for (let source = 0, target = 0; source < rgba.length; source += 4, target += 3) {
      rgb[target] = rgba[source];
      rgb[target + 1] = rgba[source + 1];
      rgb[target + 2] = rgba[source + 2];
    }
    return {
      tensor: tf.tensor3d(rgb, [inputSize, inputSize, 3], "int32"),
      width: inputSize,
      height: inputSize,
    };
  }
}
