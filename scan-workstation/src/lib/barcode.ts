/**
 * Barcode detection utility.
 *
 * Decoding strategy (ordered by reliability for iPhone photos):
 *  1. Native BarcodeDetector (Safari only — Chrome iOS doesn't have it)
 *  2. Quagga2 with locate=true (best for 1D barcodes in photos — actively
 *     searches the image for barcode regions instead of sampling rows)
 *  3. html5-qrcode / ZXing fallback (good for QR codes)
 */

// BarcodeDetector formats
const BD_FORMATS = [
  "ean_13", "ean_8", "upc_a", "upc_e",
  "code_128", "code_39", "code_93",
  "codabar", "itf", "qr_code",
] as const;

// Max image dimension for BarcodeDetector (resize large iPhone photos)
const MAX_DECODE_DIM = 1920;

/** Check whether the native BarcodeDetector API is available */
export function hasNativeBarcodeDetector(): boolean {
  return typeof globalThis !== "undefined" && "BarcodeDetector" in globalThis;
}

/** Check whether we're in a secure context (HTTPS or localhost) */
export function isSecureContext(): boolean {
  if (typeof globalThis === "undefined" || typeof window === "undefined")
    return false;
  return window.isSecureContext ?? false;
}

/** Check whether getUserMedia is available (requires secure context) */
export function canUseLiveCamera(): boolean {
  return (
    isSecureContext() &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/** Resize large image for BarcodeDetector */
async function resizeForDetector(source: Blob | File): Promise<ImageBitmap> {
  const original = await createImageBitmap(source);
  const { width, height } = original;
  if (width <= MAX_DECODE_DIM && height <= MAX_DECODE_DIM) return original;

  const scale = MAX_DECODE_DIM / Math.max(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(original, 0, 0, canvas.width, canvas.height);
  return createImageBitmap(canvas);
}

/** Convert a File/Blob to a data URL for Quagga2 */
function toDataURL(source: Blob | File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(source);
  });
}

export interface DecodeResult {
  barcode: string | null;
  debug: string;
}

/**
 * Decode barcode from a photo (Blob / File).
 * Works in both HTTP and HTTPS contexts.
 */
export async function decodeFromImage(
  imageSource: Blob | File
): Promise<DecodeResult> {
  const dbg: string[] = [];
  const kb = (imageSource.size / 1024).toFixed(0);
  const type = imageSource instanceof File ? imageSource.type : imageSource.type;
  dbg.push(`${kb}KB ${type}`);

  // --- Attempt 1: Native BarcodeDetector (Safari iOS only) ---
  const hasBD = hasNativeBarcodeDetector();
  dbg.push(hasBD ? "BD:yes" : "BD:no");

  if (hasBD) {
    try {
      const bitmap = await resizeForDetector(imageSource);
      dbg.push(`${bitmap.width}x${bitmap.height}`);
      const detector = new BarcodeDetector({ formats: [...BD_FORMATS] });
      const results = await detector.detect(bitmap);
      if (results.length > 0) {
        return { barcode: results[0].rawValue, debug: dbg.join("|") };
      }
      dbg.push("BD:0found");
    } catch (e) {
      dbg.push(`BD:err ${e instanceof Error ? e.message : e}`);
    }
  }

  // --- Attempt 2: Quagga2 (locate=true, best for 1D barcodes in photos) ---
  try {
    const Quagga = (await import("@ericblade/quagga2")).default;
    const dataURL = await toDataURL(imageSource);
    dbg.push("Q2:scanning");

    const quaggaResult = await new Promise<string | null>((resolve) => {
      Quagga.decodeSingle(
        {
          src: dataURL,
          numOfWorkers: 0, // No web workers (simpler, works everywhere)
          locate: true,    // Actively search for barcode region in image
          decoder: {
            readers: [
              "ean_reader",
              "ean_8_reader",
              "upc_reader",
              "upc_e_reader",
              "code_128_reader",
              "code_39_reader",
              "code_93_reader",
              "codabar_reader",
              "i2of5_reader",
            ],
          },
        },
        (result) => {
          if (result?.codeResult?.code) {
            resolve(result.codeResult.code);
          } else {
            resolve(null);
          }
        }
      );
    });

    if (quaggaResult) {
      dbg.push(`Q2:found ${quaggaResult}`);
      return { barcode: quaggaResult, debug: dbg.join("|") };
    }
    dbg.push("Q2:0found");
  } catch (e) {
    dbg.push(`Q2:err ${e instanceof Error ? e.message : e}`);
  }

  // --- Attempt 3: html5-qrcode / ZXing (good for QR codes) ---
  try {
    const { Html5Qrcode } = await import("html5-qrcode");
    const file =
      imageSource instanceof File
        ? imageSource
        : new File([imageSource], "scan.jpg", { type: type || "image/jpeg" });

    const containerId = "__barcode-decode-tmp";
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement("div");
      container.id = containerId;
      container.style.cssText =
        "position:fixed;left:-9999px;top:-9999px;width:300px;height:300px;overflow:hidden;";
      document.body.appendChild(container);
    }

    const html5Qr = new Html5Qrcode(containerId, {
      verbose: false,
      useBarCodeDetectorIfSupported: false,
    });
    dbg.push("ZX:scanning");
    const result = await html5Qr.scanFile(file, false);
    const text =
      typeof result === "string"
        ? result
        : (result as { decodedText?: string })?.decodedText;
    if (text) {
      dbg.push(`ZX:found ${text}`);
      return { barcode: text, debug: dbg.join("|") };
    }
    dbg.push("ZX:0found");
  } catch (e) {
    dbg.push(`ZX:err ${e instanceof Error ? e.message : String(e).slice(0, 60)}`);
  }

  return { barcode: null, debug: dbg.join("|") };
}

/**
 * Decode barcode from a video frame (for live scanning / HTTPS mode).
 */
export async function decodeFromVideo(
  video: HTMLVideoElement
): Promise<string | null> {
  if (!hasNativeBarcodeDetector()) return null;

  try {
    const detector = new BarcodeDetector({ formats: [...BD_FORMATS] });
    const results = await detector.detect(video);
    if (results.length > 0) return results[0].rawValue;
  } catch {
    // Detection failed for this frame
  }

  return null;
}
