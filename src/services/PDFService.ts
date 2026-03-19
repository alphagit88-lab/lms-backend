import PDFDocument from "pdfkit";
import { Logger } from "../utils/logger";
import path from "path";
import fs from "fs";

/**
 * PDF Service — Converts exam submissions to downloadable PDF documents
 * Story 5.9
 */
export class PDFService {
    /**
     * Generate a PDF report for a student's exam submission
     */
    static async generateSubmissionPDF(data: {
        examTitle: string;
        studentName: string;
        attemptNumber: number;
        totalMarks: number;
        marksAwarded: number;
        submittedAt: string;
        questions: Array<{
            questionText: string;
            questionType: string;
            marks: number;
            answerText?: string;
            uploadUrl?: string;
            marksAwarded?: number;
            feedback?: string;
        }>;
        overallFeedback?: string;
    }): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ margin: 50, size: "A4" });
                const chunks: Buffer[] = [];

                doc.on("data", (chunk: Buffer) => chunks.push(chunk));
                doc.on("end", () => resolve(Buffer.concat(chunks)));
                doc.on("error", reject);

                // Setup Unicode font if available
                const fontPath = path.join(__dirname, "../assets/fonts/FreeSerif.ttf");
                const hasUnicodeFont = fs.existsSync(fontPath);
                
                const setMainFont = (bold = false) => {
                    if (hasUnicodeFont) {
                        doc.font(fontPath);
                    } else {
                        doc.font(bold ? "Helvetica-Bold" : "Helvetica");
                    }
                };

                // Header
                setMainFont(true);
                doc.fontSize(20).fillColor("#111111")
                    .text(data.examTitle, { align: "center" });
                doc.moveDown(0.5);
                
                setMainFont(false);
                doc.fontSize(12).fillColor("#333333")
                    .text(`Student: ${data.studentName}`, { align: "center" });
                doc.text(`Attempt: ${data.attemptNumber} | Submitted: ${data.submittedAt}`, { align: "center" });
                doc.moveDown(0.3);

                // Score box
                const scorePercent = data.totalMarks > 0
                    ? ((data.marksAwarded / data.totalMarks) * 100).toFixed(1)
                    : "0";
                setMainFont(true);
                doc.fontSize(16).fillColor("#000000")
                    .text(`Score: ${data.marksAwarded} / ${data.totalMarks} (${scorePercent}%)`, { align: "center" });

                doc.moveDown(1);
                doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#cccccc");
                doc.moveDown(1);

                // Questions
                data.questions.forEach((q, idx) => {
                    if (doc.y > 680) {
                        doc.addPage();
                    }

                    setMainFont(true);
                    doc.fontSize(11).fillColor("#000000")
                        .text(`Q${idx + 1}. ${q.questionText}`);
                    
                    setMainFont(false);
                    doc.fontSize(9).fillColor("#888888")
                        .text(`[${q.questionType.toUpperCase().replace("_", " ")} — ${q.marks} marks]`);

                    doc.moveDown(0.3);

                    // Student answer
                    doc.fontSize(10).fillColor("#333333")
                        .text("Your Answer: ", { continued: true });
                    doc.fillColor("#000000")
                        .text(q.answerText || (q.uploadUrl ? "[Handwritten Upload]" : "[No answer provided]"));

                    if (q.uploadUrl) {
                        doc.fontSize(9).fillColor("#0066cc")
                            .text(`Attachment: ${q.uploadUrl}`);
                    }

                    // Marks and feedback
                    if (q.marksAwarded !== undefined && q.marksAwarded !== null) {
                        doc.moveDown(0.2);
                        setMainFont(true);
                        doc.fontSize(10).fillColor("#006600")
                            .text(`Marks: ${q.marksAwarded} / ${q.marks}`);
                    }
                    if (q.feedback) {
                        setMainFont(false);
                        doc.fontSize(9).fillColor("#666666")
                            .text(`Feedback: ${q.feedback}`);
                    }

                    doc.moveDown(0.8);
                    doc.fillColor("#000000"); // Reset
                });

                // Overall feedback
                if (data.overallFeedback) {
                    doc.moveDown(0.5);
                    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#cccccc");
                    doc.moveDown(0.5);
                    setMainFont(true);
                    doc.fontSize(11).fillColor("#000000")
                        .text("Instructor Feedback:");
                    setMainFont(false);
                    doc.fontSize(10).fillColor("#333333")
                        .text(data.overallFeedback);
                }

                // Footer
                doc.moveDown(2);
                setMainFont(false);
                doc.fontSize(8).fillColor("#999999")
                    .text(`Generated on ${new Date().toISOString().split("T")[0]} — LMS Platform`, {
                        align: "center"
                    });

                doc.end();
            } catch (error) {
                Logger.error("PDF generation failed:", error);
                reject(new Error("Failed to generate PDF."));
            }
        });
    }
}
