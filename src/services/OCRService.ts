import Tesseract from "tesseract.js";
import { Logger } from "../utils/logger";

/**
 * OCR Service — Extracts text from uploaded handwritten answer images
 * Uses Tesseract.js for client-side OCR (no external API keys needed)
 * Story 5.8
 */
export class OCRService {
    /**
     * Extract text from an image URL using Tesseract OCR
     * @param imageUrl - URL of the image (Cloudinary or local path)
     * @param lang - Language for OCR (default: eng)
     * @returns Extracted text string
     */
    static async extractText(imageUrl: string, lang: string = "eng"): Promise<string> {
        try {
            Logger.info(`OCR: Processing image: ${imageUrl}`);

            const result = await Tesseract.recognize(imageUrl, lang, {
                logger: (m: any) => {
                    if (m.status === "recognizing text") {
                        Logger.info(`OCR progress: ${Math.round(m.progress * 100)}%`);
                    }
                }
            });

            const extractedText = result.data.text.trim();
            Logger.info(`OCR: Extracted ${extractedText.length} characters`);

            return extractedText;
        } catch (error) {
            Logger.error("OCR extraction failed:", error);
            throw new Error("Failed to extract text from image.");
        }
    }

    /**
     * Process a submission's uploaded image and store OCR text
     * @param submissionId - The AnswerSubmission ID
     * @param imageUrl - URL of the uploaded image
     */
    static async processSubmissionImage(
        submissionId: string,
        imageUrl: string
    ): Promise<string> {
        try {
            const text = await this.extractText(imageUrl);

            // Update the submission with OCR text
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
