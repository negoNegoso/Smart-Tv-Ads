import { Readable } from "stream";
import { Router, type IRouter, type Request, type Response } from "express";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

// Public read-only serving for announcement images stored in App Storage.
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const path = Array.isArray(raw) ? raw.join("/") : raw;
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