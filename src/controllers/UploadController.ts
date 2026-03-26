import { Request, Response } from "express";
import { PutBlobResult } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export class UploadController {
  static async handleClientUpload(req: Request, res: Response) {
    try {
      const body = req.body as HandleUploadBody;
      const userId = (req.session as any)?.userId;
      const userRole = (req.session as any)?.userRole;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (userRole !== "instructor" && userRole !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }

      try {
        const jsonResponse = await handleUpload({
          body,
          request: req,
          onBeforeGenerateToken: async (pathname: string, clientPayload: string | null) => {
            // Generate a client token for the file
            // Allowed types: images, videos
            return {
              allowedContentTypes: [
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/gif",
                "video/mp4",
                "video/webm",
                "video/x-matroska", 
                "video/quicktime",
              ],
              tokenPayload: JSON.stringify({ userId, role: userRole }),
            };
          },
          onUploadCompleted: async ({ blob, tokenPayload }: { blob: PutBlobResult; tokenPayload?: string | null }) => {
            console.log("Blob upload completed:", blob.url, tokenPayload);
            // Optionally save to DB here or just let client finish the job
          },
        });

        return res.json(jsonResponse);
      } catch (error) {
        return res.status(400).json({ error: (error as Error).message });
      }
    } catch (error) {
      console.error("Upload handler error:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
}
