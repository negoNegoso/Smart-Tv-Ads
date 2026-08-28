import { LocalDiskStore } from "./local-disk";
import { ReplitObjectStore } from "./replit";
import type { MediaStore } from "./types";
import { VercelBlobStore } from "./vercel-blob";

export type { MediaStore };

export function createMediaStore(env: NodeJS.ProcessEnv = process.env): MediaStore {
  if (env.BLOB_READ_WRITE_TOKEN) return new VercelBlobStore();
  if (env.PRIVATE_OBJECT_DIR) return new ReplitObjectStore();
  return new LocalDiskStore();
}

let cached: MediaStore | null = null;

/** Memoized store for the running process. Routes should use this. */
export function mediaStore(): MediaStore {
  if (!cached) cached = createMediaStore();
  return cached;
}
