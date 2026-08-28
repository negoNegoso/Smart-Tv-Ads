import { Readable } from "stream";
import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

// Public read-only serving for announcement images stored in Replit App Storage.
// The @google-cloud/storage client is loaded lazily so that this module can be
// bundled for environments where that package is not installed.
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  if (!process.env.PRIVATE_OBJECT_DIR) {
    res.status(404).json({ error: "Object not found" });
    return;
  }

  const { ObjectNotFoundError, ObjectStorageService } = await import("../lib/objectStorage");

  try {
    const raw = req.params.path;
    const path = Array.isArray(raw) ? raw.join("/") : raw;
    const objectStorage = new ObjectStorageService();
    const file = await objectStorage.getObjectEntityFile(`/objects/${path}`);
    const response = await objectStorage.downloadObject(file, 86400);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving stored image");
    res.status(500).json({ error: "Failed to serve stored image" });
  }
});

export default router;
