import { AprilTagFamily, type Pixel } from "apriltag";
import tag36h11 from "apriltag/families/36h11.json";
import { STUDIO_NAME } from "./branding";

export const APRIL_TAG_FAMILY = "tag36h11" as const;
export const APRIL_TAG_IDS = tag36h11.codes.map((_, id) => id);

export type AprilTagPoint = { x: number; y: number };

export type AprilTagDetection = {
  id: number;
  family: typeof APRIL_TAG_FAMILY;
  corners: [AprilTagPoint, AprilTagPoint, AprilTagPoint, AprilTagPoint];
  center: AprilTagPoint;
  bbox: [number, number, number, number];
  frameWidth: number;
  frameHeight: number;
  centerX: number;
  centerY: number;
  yaw: number;
  hamming: number;
};

const family = new AprilTagFamily(tag36h11);
const tagTemplates = APRIL_TAG_IDS.map((id) => family.render(id));

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const normalizeAngle = (angle: number) => {
  let normalized = angle % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized <= -180) normalized += 360;
  return normalized;
};

const rotateClockwise = <T,>(grid: T[][]) => {
  const size = grid.length;
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => grid[size - 1 - x][y]),
  );
};

const rotatedTemplate = (template: Pixel[][], turns: number) => {
  let rotated = template;
  for (let index = 0; index < turns; index += 1) rotated = rotateClockwise(rotated);
  return rotated;
};

const templateRotations = tagTemplates.map((template) =>
  [0, 1, 2, 3].map((turns) => rotatedTemplate(template, turns)),
);

export const getAprilTagPixels = (id: number) =>
  tagTemplates[clamp(Math.round(Number(id) || 0), 0, tagTemplates.length - 1)];

export const aprilTagSvgDataUri = (id: number) => {
  const pixels = getAprilTagPixels(id);
  const cells = pixels.flatMap((row, y) => row.flatMap((pixel, x) =>
    pixel === "b" ? [`<rect x="${x + 1}" y="${y + 1}" width="1" height="1"/>`] : [],
  )).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><rect width="12" height="12" fill="white"/><g fill="black">${cells}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

export const drawAprilTag = (
  context: CanvasRenderingContext2D,
  id: number,
  size: number,
) => {
  const pixels = getAprilTagPixels(id);
  const cellSize = size / 12;
  context.fillStyle = "#fff";
  context.fillRect(-size / 2, -size / 2, size, size);
  context.fillStyle = "#050505";
  pixels.forEach((row, y) => row.forEach((pixel, x) => {
    if (pixel === "b") {
      context.fillRect(
        -size / 2 + (x + 1) * cellSize,
        -size / 2 + (y + 1) * cellSize,
        cellSize + 0.2,
        cellSize + 0.2,
      );
    }
  }));
};

const pdfByteLength = (value: string) => new TextEncoder().encode(value).byteLength;

/** Builds a sharp, printable US Letter PDF without requiring a network service. */
export const buildAprilTagPdf = (id: number) => {
  const safeId = clamp(Math.round(Number(id) || 0), 0, tagTemplates.length - 1);
  const pixels = getAprilTagPixels(safeId);
  const pageWidth = 612;
  const pageHeight = 792;
  const markerSize = 540;
  const markerLeft = (pageWidth - markerSize) / 2;
  const markerBottom = (pageHeight - markerSize) / 2;
  const cellSize = markerSize / pixels.length;
  const drawing = [
    "q",
    "1 1 1 rg",
    `0 0 ${pageWidth} ${pageHeight} re f`,
    "0 0 0 rg",
    ...pixels.flatMap((row, y) => row.flatMap((pixel, x) => pixel === "b"
      ? [`${markerLeft + x * cellSize} ${markerBottom + (pixels.length - 1 - y) * cellSize} ${cellSize} ${cellSize} re f`]
      : [])),
    "Q",
    "BT",
    "/F1 11 Tf",
    "0 0 0 rg",
    `36 52 Td (tag36h11 - ID ${safeId}) Tj`,
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${pdfByteLength(drawing)} >>\nstream\n${drawing}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Title (${STUDIO_NAME} AprilTag tag36h11 ID ${safeId}) /Creator (${STUDIO_NAME}) >>`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdfByteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdfByteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
};

const otsuThreshold = (grayscale: Uint8Array) => {
  const histogram = new Uint32Array(256);
  grayscale.forEach((value) => { histogram[value] += 1; });
  const total = grayscale.length;
  let sum = 0;
  histogram.forEach((count, value) => { sum += count * value; });
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let maximumVariance = -1;
  let threshold = 127;
  for (let value = 0; value < 256; value += 1) {
    backgroundWeight += histogram[value];
    if (backgroundWeight === 0) continue;
    const foregroundWeight = total - backgroundWeight;
    if (foregroundWeight === 0) break;
    backgroundSum += value * histogram[value];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > maximumVariance) {
      maximumVariance = variance;
      threshold = value;
    }
  }
  return clamp(threshold, 35, 220);
};

type Candidate = {
  corners: [AprilTagPoint, AprilTagPoint, AprilTagPoint, AprilTagPoint];
  bounds: [number, number, number, number];
  pixels: number;
};

const findCandidates = (
  grayscale: Uint8Array,
  width: number,
  height: number,
  threshold: number,
) => {
  const visited = new Uint8Array(width * height);
  const minimumPixels = Math.max(45, Math.round(width * height * 0.00035));
  const maximumPixels = width * height * 0.42;
  const candidates: Candidate[] = [];
  const queue = new Int32Array(width * height);

  for (let start = 0; start < grayscale.length; start += 1) {
    if (visited[start] || grayscale[start] > threshold) continue;
    let head = 0;
    let tail = 1;
    queue[0] = start;
    visited[start] = 1;
    let count = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    let minSum = Number.POSITIVE_INFINITY;
    let maxSum = Number.NEGATIVE_INFINITY;
    let minDiff = Number.POSITIVE_INFINITY;
    let maxDiff = Number.NEGATIVE_INFINITY;
    let topLeft = { x: 0, y: 0 };
    let topRight = { x: 0, y: 0 };
    let bottomRight = { x: 0, y: 0 };
    let bottomLeft = { x: 0, y: 0 };

    while (head < tail) {
      const pixelIndex = queue[head++];
      count += 1;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      const sum = x + y;
      const difference = x - y;
      if (sum < minSum) { minSum = sum; topLeft = { x, y }; }
      if (sum > maxSum) { maxSum = sum; bottomRight = { x, y }; }
      if (difference > maxDiff) { maxDiff = difference; topRight = { x, y }; }
      if (difference < minDiff) { minDiff = difference; bottomLeft = { x, y }; }

      const neighbors = [pixelIndex - 1, pixelIndex + 1, pixelIndex - width, pixelIndex + width];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= grayscale.length || visited[neighbor]) continue;
        const neighborX = neighbor % width;
        if (Math.abs(neighborX - x) > 1 || grayscale[neighbor] > threshold) continue;
        visited[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }

    if (count < minimumPixels || count > maximumPixels) continue;
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const aspect = boxWidth / boxHeight;
    const fill = count / (boxWidth * boxHeight);
    const minimumSide = Math.min(boxWidth, boxHeight);
    if (minimumSide < 12 || aspect < 0.48 || aspect > 2.08 || fill < 0.12 || fill > 0.82) continue;
    const polygonArea = Math.abs(
      topLeft.x * topRight.y - topRight.x * topLeft.y +
      topRight.x * bottomRight.y - bottomRight.x * topRight.y +
      bottomRight.x * bottomLeft.y - bottomLeft.x * bottomRight.y +
      bottomLeft.x * topLeft.y - topLeft.x * bottomLeft.y
    ) / 2;
    if (polygonArea < minimumSide * minimumSide * 0.35) continue;
    candidates.push({
      corners: [topLeft, topRight, bottomRight, bottomLeft],
      bounds: [minX, minY, boxWidth, boxHeight],
      pixels: count,
    });
  }
  return candidates.sort((left, right) => right.pixels - left.pixels).slice(0, 24);
};

const bilinearPoint = (
  corners: Candidate["corners"],
  horizontal: number,
  vertical: number,
) => {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const top = {
    x: topLeft.x + (topRight.x - topLeft.x) * horizontal,
    y: topLeft.y + (topRight.y - topLeft.y) * horizontal,
  };
  const bottom = {
    x: bottomLeft.x + (bottomRight.x - bottomLeft.x) * horizontal,
    y: bottomLeft.y + (bottomRight.y - bottomLeft.y) * horizontal,
  };
  return {
    x: top.x + (bottom.x - top.x) * vertical,
    y: top.y + (bottom.y - top.y) * vertical,
  };
};

const sampleCandidate = (
  candidate: Candidate,
  grayscale: Uint8Array,
  width: number,
  height: number,
) => {
  const samples = Array.from({ length: 8 }, () => Array<number>(8).fill(0));
  const values: number[] = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const point = bilinearPoint(candidate.corners, (x + 0.5) / 8, (y + 0.5) / 8);
      const centerX = clamp(Math.round(point.x), 1, width - 2);
      const centerY = clamp(Math.round(point.y), 1, height - 2);
      let total = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          total += grayscale[(centerY + offsetY) * width + centerX + offsetX];
        }
      }
      const value = total / 9;
      samples[y][x] = value;
      values.push(value);
    }
  }
  const sorted = [...values].sort((left, right) => left - right);
  const low = sorted[Math.floor(sorted.length * 0.1)];
  const high = sorted[Math.floor(sorted.length * 0.9)];
  if (high - low < 34) return null;
  const threshold = (low + high) / 2;
  return samples.map((row) => row.map((value) => value >= threshold ? "w" as Pixel : "b" as Pixel));
};

const matchSample = (sample: Pixel[][]) => {
  let best = { id: -1, rotation: 0, hamming: Number.POSITIVE_INFINITY };
  for (let id = 0; id < templateRotations.length; id += 1) {
    for (let rotation = 0; rotation < 4; rotation += 1) {
      const template = templateRotations[id][rotation];
      let hamming = 0;
      let borderErrors = 0;
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const observed = sample[y][x];
          const expected = template[y + 1][x + 1];
          if (observed !== expected) {
            if (x === 0 || y === 0 || x === 7 || y === 7) borderErrors += 1;
            else hamming += 1;
          }
        }
      }
      if (borderErrors > 3) continue;
      if (hamming < best.hamming) best = { id, rotation, hamming };
    }
  }
  return best.hamming <= 3 ? best : null;
};

const canonicalCorners = (
  observed: Candidate["corners"],
  rotation: number,
): AprilTagDetection["corners"] => [
  observed[rotation % 4],
  observed[(rotation + 1) % 4],
  observed[(rotation + 2) % 4],
  observed[(rotation + 3) % 4],
];

export const detectAprilTags = (
  imageData: ImageData,
  width = imageData.width,
  height = imageData.height,
) => {
  const grayscale = new Uint8Array(width * height);
  for (let pixel = 0, source = 0; pixel < grayscale.length; pixel += 1, source += 4) {
    grayscale[pixel] = Math.round(
      imageData.data[source] * 0.2126 +
      imageData.data[source + 1] * 0.7152 +
      imageData.data[source + 2] * 0.0722,
    );
  }
  const threshold = otsuThreshold(grayscale);
  const detections: AprilTagDetection[] = [];
  const seenIds = new Set<number>();
  for (const candidate of findCandidates(grayscale, width, height, threshold)) {
    const sample = sampleCandidate(candidate, grayscale, width, height);
    if (!sample) continue;
    const match = matchSample(sample);
    if (!match || seenIds.has(match.id)) continue;
    const corners = canonicalCorners(candidate.corners, match.rotation);
    const center = corners.reduce(
      (point, corner) => ({ x: point.x + corner.x / 4, y: point.y + corner.y / 4 }),
      { x: 0, y: 0 },
    );
    const rightEdge = {
      x: (corners[1].x + corners[2].x) / 2,
      y: (corners[1].y + corners[2].y) / 2,
    };
    const yaw = normalizeAngle(
      Math.atan2(rightEdge.y - center.y, rightEdge.x - center.x) * 180 / Math.PI + 90,
    );
    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);
    detections.push({
      id: match.id,
      family: APRIL_TAG_FAMILY,
      corners,
      center,
      bbox: [left, top, right - left, bottom - top],
      frameWidth: width,
      frameHeight: height,
      centerX: Math.round(clamp((center.x / width - 0.5) * 200, -100, 100) * 10) / 10,
      centerY: Math.round(clamp((0.5 - center.y / height) * 200, -100, 100) * 10) / 10,
      yaw: Math.round(yaw * 10) / 10,
      hamming: match.hamming,
    });
    seenIds.add(match.id);
  }
  return detections;
};
