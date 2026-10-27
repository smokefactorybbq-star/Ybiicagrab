import sharp from "sharp";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_IMAGE_BYTES + 256 * 1024;
const MAX_IMAGE_PIXELS = 80_000_000;

function detectImage(input: Buffer) {
  const isPng = input.length >= 8 && input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = input.length >= 3 && input[0] === 255 && input[1] === 216 && input[2] === 255;
  const isWebp = input.length >= 12 && input.subarray(0, 4).toString("ascii") === "RIFF" && input.subarray(8, 12).toString("ascii") === "WEBP";
  const brand = input.length >= 12 ? input.subarray(8, 12).toString("ascii") : "";
  const isAvif = input.length >= 12 && input.subarray(4, 8).toString("ascii") === "ftyp" && ["avif", "avis"].includes(brand);
  return isPng || isJpeg || isWebp || isAvif;
}

export async function readChatInput(request: Request) {
  let text = "";
  let file: File | null = null;
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) throw new Error("IMAGE_TOO_LARGE");

    let form: FormData;
    try {
      // Use the platform multipart parser. Rebuilding multipart bodies manually from
      // request.body was fragile with real mobile uploads and could fail before Sharp.
      form = await request.formData();
    } catch {
      throw new Error("BAD_MESSAGE");
    }

    text = String(form.get("text") || "").trim();
    const entry = form.get("image");
    if (entry && typeof entry !== "string" && entry.size > 0) file = entry;
  } else {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new Error("BAD_MESSAGE");
    }
    if (!body || typeof body !== "object") throw new Error("BAD_MESSAGE");
    const value = body as { text?: unknown };
    text = typeof value.text === "string" ? value.text.trim() : "";
  }

  if (text.length > 4000 || (!text && !file)) throw new Error("BAD_MESSAGE");

  let image: Buffer | null = null;
  if (file) {
    if (file.size > MAX_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");

    const input = Buffer.from(await file.arrayBuffer());
    if (!detectImage(input)) throw new Error("BAD_IMAGE");

    try {
      const metadata = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, animated: false }).metadata();
      if (!metadata.format || !["jpeg", "png", "webp", "heif"].includes(metadata.format)) throw new Error("BAD_IMAGE");
      if ((metadata.width || 0) * (metadata.height || 0) > MAX_IMAGE_PIXELS) throw new Error("IMAGE_PIXELS_TOO_LARGE");

      // Normalize every uploaded image to WebP, strip metadata and resize large phone
      // photos before storing them in PostgreSQL.
      image = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, animated: false })
        .rotate()
        .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 84 })
        .toBuffer();

      if (image.length > MAX_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");
    } catch (error) {
      if (error instanceof Error && ["IMAGE_TOO_LARGE", "IMAGE_PIXELS_TOO_LARGE", "BAD_IMAGE"].includes(error.message)) throw error;
      throw new Error("BAD_IMAGE");
    }
  }

  return { text, image };
}
