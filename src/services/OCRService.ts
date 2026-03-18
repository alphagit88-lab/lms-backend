import Tesseract from "tesseract.js";
import { Logger } from "../utils/logger";
import * as path from "path";
import * as fs from "fs";
import sharp from "sharp";

/**
 * OCR Service — Extracts text from uploaded handwritten answer images
 * Uses Tesseract.js with sharp-based image preprocessing for improved accuracy.
 *
 * Preprocessing pipeline applied before OCR (especially important for handwriting):
 *   1. Grayscale conversion             — removes colour noise, reduces file size
 *   2. Resize to ≥2400px width          — Tesseract works best at ~300 DPI equivalent
 *   3. Normalise (auto levels)          — stretches histogram to full 0–255 range
 *   4. Unsharp mask (sharpen)           — sharpens pen strokes
 *   5. Adaptive threshold (to PNG)      — binarises to pure black/white, removes shadows
 *
 * Story 5.8
 */
export class OCRService {

    /**
     * Resolve an imageUrl to something Tesseract.js can read in Node.js.
     * - Relative /uploads/... path  → absolute filesystem path
     * - https:// URL               → pass through as-is
     * - Absolute file path         → pass through as-is
     */
    private static resolveImageSource(imageUrl: string): string {
        if (imageUrl.startsWith("/uploads/")) {
            const uploadBaseDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
            const relativePart = imageUrl.replace(/^\/uploads\//, "");
            const absolutePath = path.join(uploadBaseDir, relativePart);

            if (!fs.existsSync(absolutePath)) {
                Logger.warn(`OCR: File not found at resolved path: ${absolutePath}`);
                throw new Error(`Uploaded file not found on disk: ${absolutePath}`);
            }

            Logger.info(`OCR: Resolved '${imageUrl}' → '${absolutePath}'`);
            return absolutePath;
        }
        return imageUrl;
    }

    /**
     * Preprocess an image file for better Tesseract OCR accuracy on handwriting.
     * Returns a Buffer of the processed PNG image.
     */
    private static async preprocessImage(imagePath: string): Promise<Buffer> {
        Logger.info(`OCR: Preprocessing image: ${imagePath}`);

        const rawBuffer = fs.readFileSync(imagePath);

        // Build the sharp pipeline
        let pipeline = sharp(rawBuffer)
            // 1. Convert to greyscale
            .grayscale()
            // 2. Resize: upscale narrow images so Tesseract gets enough pixels
            //    Tesseract performs best near 300 DPI; a typical A4 scan at 300 DPI = 2480px wide.
            //    We target 2400px width minimum, preserving aspect ratio.
            .resize({
                width: 2400,
                withoutEnlargement: false, // DO upscale small images
                fit: "inside",
            })
            // 3. Normalise (auto-levels): stretches contrast across full tonal range
            .normalise()
            // 4. Unsharp mask: sharpens pen ink edges (sigma 1.5, strength 1.2)
            .sharpen({ sigma: 1.5, m1: 1.2, m2: 0.5 })
            // 5. Linear levels boost: slightly boost brightness on already-normalised image
            //    (helps with pencil/faint ink)
            .linear(1.2, -(128 * 0.2))
            // 6. Threshold binarisation: convert to pure black (ink) + white (paper)
            //    Threshold value 128 is the midpoint — text darker than grey becomes black.
            .threshold(128)
            // Output as PNG (lossless — avoids JPEG compression artefacts that confuse Tesseract)
            .png({ compressionLevel: 1 }); // low compression for speed

        const processedBuffer = await pipeline.toBuffer();
        Logger.info(`OCR: Preprocessing complete — processed buffer size: ${processedBuffer.length} bytes`);
        return processedBuffer;
    }

    /**
     * Extract text from an image using Tesseract OCR with image preprocessing.
     *
     * @param imageUrl - Relative /uploads/... path, absolute file path, or https:// URL
     * @param lang     - Tesseract language code (default: eng; use 'sin' for Sinhala, 'tam' for Tamil)
     * @returns Extracted text string
     */
    static async extractText(imageUrl: string, lang: string = "eng"): Promise<string> {
        try {
            const source = OCRService.resolveImageSource(imageUrl);
            Logger.info(`OCR: Starting pipeline for source: ${source} (lang: ${lang})`);

            let imageInput: Buffer | string;

            // Only preprocess local files (we have raw bytes); for remote URLs pass through
            if (!source.startsWith("http://") && !source.startsWith("https://")) {
                imageInput = await OCRService.preprocessImage(source);
            } else {
                imageInput = source; // Tesseract can download https:// URLs itself
            }

            const result = await Tesseract.recognize(imageInput, lang, {
                logger: (m: any) => {
                    if (m.status === "recognizing text") {
                        Logger.info(`OCR progress: ${Math.round(m.progress * 100)}%`);
                    }
                }
            });

            const extractedText = result.data.text.trim();
            Logger.info(`OCR: Extracted ${extractedText.length} characters (confidence: ~${Math.round(result.data.confidence)}%)`);

            return extractedText;
        } catch (error) {
            Logger.error("OCR extraction failed:", error);
            throw new Error(`Failed to extract text from image: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Process a submission's uploaded image, store OCR text in the DB.
     * @param submissionId - The AnswerSubmission ID
     * @param imageUrl     - Relative /uploads/... path, absolute path, or https:// URL
     */
    static async processSubmissionImage(
        submissionId: string,
        imageUrl: string
    ): Promise<string> {
        try {
            const text = await this.extractText(imageUrl);

            const { AppDataSource } = await import("../config/data-source");
            const { AnswerSubmission } = await import("../entities/AnswerSubmission");

            const repo = AppDataSource.getRepository(AnswerSubmission);
            await repo.update(submissionId, { ocrText: text });

            Logger.info(`OCR: Updated submission ${submissionId} with extracted text`);
            return text;
        } catch (error) {
            Logger.error(`OCR: Failed to process submission ${submissionId}:`, error);
            throw error;
        }
    }
}
