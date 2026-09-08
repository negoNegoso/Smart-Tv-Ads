/**
 * Persists announcement images. The string returned by `put` is stored verbatim
 * in `announcements.image_url` and consumed by the frontend as an `<img src>`,
 * so both absolute URLs and API-relative paths are valid return values.
 */
export interface MediaStore {
  put(buffer: Buffer, mimetype: string, originalname: string): Promise<string>;
  /** Tolerates URLs produced by a different implementation: returns without error. */
  remove(imageUrl: string): Promise<void>;
  /**
   * Reads the object back as a Buffer. Returns null — never throws — when the
   * URL does not belong to this backend or the object no longer exists.
   * Callers (e.g. resolving a promo photo already uploaded through the
   * portal) treat null as "no image" and move on.
   */
  get(imageUrl: string): Promise<Buffer | null>;
}
