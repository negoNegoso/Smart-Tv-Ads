/**
 * Persists announcement images. The string returned by `put` is stored verbatim
 * in `announcements.image_url` and consumed by the frontend as an `<img src>`,
 * so both absolute URLs and API-relative paths are valid return values.
 */
export interface MediaStore {
  put(buffer: Buffer, mimetype: string, originalname: string): Promise<string>;
  /** Tolerates URLs produced by a different implementation: returns without error. */
  remove(imageUrl: string): Promise<void>;
}
