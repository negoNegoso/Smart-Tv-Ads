export function mediaUrl(imageUrl: string | null | undefined): string {
  if (!imageUrl) return "";
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return imageUrl;
  if (imageUrl.startsWith("/api/")) {
    return `${import.meta.env.BASE_URL}${imageUrl.slice(1)}`;
  }
  const filename = imageUrl.split("/").pop() || imageUrl;
  return `${import.meta.env.BASE_URL}api/uploads/${filename}`;
}