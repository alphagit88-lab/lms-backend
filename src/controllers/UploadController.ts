import { Request, Response } from "express";
import { PutBlobResult } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export class UploadController {
  static async handleClientUpload(req: Request, res: Response) {
    try {
      console.log(`[Upload] handleClientUpload body keys:`, Object.keys(req.body));
      const body = req.body as HandleUploadBody;
      const userId = (req.session as any)?.userId;
      const userRole = (req.session as any)?.userRole;

      if (!userId) {
        console.warn("[Upload] Unauthorized blob upload attempt - no userId in session");
        // Print cookies for debugging
        console.log("[Upload] Cookies present:", req.headers.cookie ? "Yes" : "No");
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (userRole !== "instructor" && userRole !== "admin") {
        console.warn(`[Upload] Forbidden blob upload attempt for user ${userId} with role ${userRole}`);
        return res.status(403).json({ error: "Forbidden" });
      }

      try {
        const jsonResponse = await handleUpload({
          body,
          request: req,
          onBeforeGenerateToken: async (pathname: string, clientPayload: string | null) => {
            console.log(`[Upload] Generating token for path: ${pathname}, payload: ${clientPayload}`);
            return {
              allowedContentTypes: [
                "image/jpeg", "image/png", "image/webp", "image/gif",
                "video/mp4", "video/webm", "video/x-matroska", "video/quicktime",
                "audio/mpeg", "audio/wav", "audio/ogg",
                "application/pdf",
                "application/msword",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/vnd.ms-powerpoint",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation"
              ],
              tokenPayload: JSON.stringify({ userId, role: userRole }),
            };
          },
          onUploadCompleted: async ({ blob, tokenPayload }: { blob: PutBlobResult; tokenPayload?: string | null }) => {
            console.log("[Upload] Blob upload completed:", blob.url, tokenPayload);
          },
        });

        return res.json(jsonResponse);
      } catch (error) {
        console.error("[Upload] handleUpload internal error:", error);
        return res.status(400).json({ error: (error as Error).message });
      }
    } catch (error) {
      console.error("[Upload] Critical handler error:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
}
