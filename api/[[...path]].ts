import app from "../src/index";

// Vercel serverless catch-all for forwarding requests to the Express app.
// We also strip the leading `/api` prefix because Vercel routes this function
// under `/api/*` when using rewrites.
export default async function handler(req: any, res: any) {
  if (typeof req?.url === "string" && req.url.startsWith("/api/")) {
    req.url = req.url.replace(/^\/api/, "");
  }

  return app(req, res);
}

