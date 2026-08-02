import type { SimulationObject } from "./simulation";
import { STUDIO_NAME } from "./branding";

export type SimulatorObjectTemplate = Pick<
  SimulationObject,
  "label" | "src" | "emoji" | "flagColor" | "size" | "kind"
> & {
  menuLabel: string;
};

export const SIMULATOR_OBJECT_LIBRARY: SimulatorObjectTemplate[] = [
  { label: "person", menuLabel: "Person (Marine)", src: "sim-assets/marine-digicam.png", size: 0.92, kind: "object" },
  { label: "knife", menuLabel: "Knife", emoji: "🔪", size: 0.68, kind: "object" },
  { label: "stop sign", menuLabel: "Stop sign", emoji: "🛑", size: 0.72, kind: "object" },
  { label: "laptop", menuLabel: "Computer (laptop)", emoji: "💻", size: 0.76, kind: "object" },
  { label: "truck", menuLabel: "Truck", emoji: "🚚", size: 0.82, kind: "object" },
  { label: "red flag", menuLabel: "Flag (red)", flagColor: "red", size: 0.78, kind: "object" },
  { label: "blue flag", menuLabel: "Flag (blue)", flagColor: "blue", size: 0.78, kind: "object" },
  { label: "car", menuLabel: "Car", src: "sim-assets/car.png", size: 0.72, kind: "object" },
  { label: "airplane", menuLabel: "Airplane", src: "sim-assets/airplane.png", size: 0.7, kind: "object" },
  { label: "banana", menuLabel: "Banana", src: "sim-assets/banana.png", size: 0.58, kind: "object" },
  { label: "apple", menuLabel: "Apple", src: "sim-assets/apple.png", size: 0.56, kind: "object" },
  { label: "white paper", menuLabel: "White paper", size: 0.72, kind: "paper" },
];

const textBytes = (value: string) => new TextEncoder().encode(value);

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`Could not load printable simulator target: ${src}`));
  image.src = new URL(src, document.baseURI).href;
});

const drawFlag = (
  context: CanvasRenderingContext2D,
  color: "red" | "blue",
  centerX: number,
  centerY: number,
  size: number,
) => {
  const poleHeight = size * 0.92;
  const poleX = centerX - size * 0.28;
  const flagTop = centerY - poleHeight * 0.46;
  const flagWidth = size * 0.7;
  const flagHeight = size * 0.42;
  context.strokeStyle = "#7b878d";
  context.lineWidth = Math.max(7, size * 0.035);
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(poleX, centerY - poleHeight / 2);
  context.lineTo(poleX, centerY + poleHeight / 2);
  context.stroke();
  context.fillStyle = color === "red" ? "#cf3346" : "#1769b2";
  context.beginPath();
  context.moveTo(poleX, flagTop);
  context.quadraticCurveTo(
    poleX + flagWidth * 0.5,
    flagTop + flagHeight * 0.13,
    poleX + flagWidth,
    flagTop,
  );
  context.lineTo(poleX + flagWidth * 0.82, flagTop + flagHeight);
  context.quadraticCurveTo(
    poleX + flagWidth * 0.42,
    flagTop + flagHeight * 0.86,
    poleX,
    flagTop + flagHeight,
  );
  context.closePath();
  context.fill();
};

const canvasJpeg = (canvas: HTMLCanvasElement) =>
  new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("Could not encode the printable simulator target."));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/jpeg", 0.96);
  });

const concatBytes = (parts: Uint8Array[]) => {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
};

const buildJpegPdf = (jpeg: Uint8Array, width: number, height: number, title: string) => {
  const content = textBytes("q\n612 0 0 792 0 0 cm\n/Im0 Do\nQ\n");
  const objects: Uint8Array[] = [
    textBytes("<< /Type /Catalog /Pages 2 0 R >>"),
    textBytes("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    textBytes("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>"),
    concatBytes([
      textBytes(`<< /Length ${content.length} >>\nstream\n`),
      content,
      textBytes("endstream"),
    ]),
    concatBytes([
      textBytes(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
      jpeg,
      textBytes("\nendstream"),
    ]),
    textBytes(`<< /Title (${title.replace(/[()\\]/g, "")}) /Creator (${STUDIO_NAME.replace(/[()\\]/g, "")}) >>`),
  ];
  const parts: Uint8Array[] = [textBytes("%PDF-1.4\n")];
  const offsets = [0];
  let byteLength = parts[0].length;
  objects.forEach((object, index) => {
    offsets.push(byteLength);
    const wrapped = concatBytes([
      textBytes(`${index + 1} 0 obj\n`),
      object,
      textBytes("\nendobj\n"),
    ]);
    parts.push(wrapped);
    byteLength += wrapped.length;
  });
  const xrefOffset = byteLength;
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\n`,
    `startxref\n${xrefOffset}\n%%EOF\n`,
  ].join("");
  parts.push(textBytes(xref));
  return concatBytes(parts);
};

/** Builds a printable US Letter PDF using the exact target art used by the simulator. */
export const buildSimulatorObjectPdf = async (label: string) => {
  const target = SIMULATOR_OBJECT_LIBRARY.find((candidate) => candidate.label === label)
    ?? SIMULATOR_OBJECT_LIBRARY[0];
  const canvas = document.createElement("canvas");
  canvas.width = 1275;
  canvas.height = 1650;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");

  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#00205b";
  context.font = "700 42px Arial, sans-serif";
  context.textAlign = "center";
  context.fillText(`${STUDIO_NAME} HARDWARE TEST TARGET`, canvas.width / 2, 72);
  context.fillStyle = "#536f79";
  context.font = "26px Arial, sans-serif";
  context.fillText(`COCO / simulator label: ${target.label}`, canvas.width / 2, 116);

  const size = 1010;
  const centerX = canvas.width / 2;
  const centerY = 760;
  if (target.src) {
    const image = await loadImage(target.src);
    const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, centerX - width / 2, centerY - height / 2, width, height);
  } else if (target.flagColor) {
    drawFlag(context, target.flagColor, centerX, centerY, size);
  } else if (target.emoji) {
    context.font = `${size * 0.78}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(target.emoji, centerX, centerY);
  } else {
    context.fillStyle = "#fff";
    context.strokeStyle = "#9aa9b0";
    context.lineWidth = 5;
    context.fillRect(centerX - size / 2, centerY - size * 0.39, size, size * 0.78);
    context.strokeRect(centerX - size / 2, centerY - size * 0.39, size, size * 0.78);
  }

  context.fillStyle = "#00205b";
  context.textBaseline = "alphabetic";
  context.font = "700 54px Arial, sans-serif";
  context.fillText(target.menuLabel.toUpperCase(), centerX, 1375);
  context.fillStyle = "#536f79";
  context.font = "24px Arial, sans-serif";
  context.fillText("Print at Actual Size / 100%. Do not use Fit to Page.", centerX, 1430);
  context.fillText("Lighting, camera angle, distance, and printer color affect detection.", centerX, 1470);
  context.strokeStyle = "#b4d7d8";
  context.lineWidth = 2;
  context.strokeRect(44, 44, canvas.width - 88, canvas.height - 88);

  const jpeg = await canvasJpeg(canvas);
  return buildJpegPdf(jpeg, canvas.width, canvas.height, `${STUDIO_NAME} ${target.menuLabel} target`);
};
