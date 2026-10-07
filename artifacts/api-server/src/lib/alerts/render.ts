import { rasterize } from "../panels/render";
import { alertNode, alertSize, type AlertArt, type AlertOrientation } from "./alert-template";

/** PNG do aviso na orientação pedida (1920×1080 ou 1080×1920). */
export async function renderAlert(art: AlertArt, orientation: AlertOrientation): Promise<Buffer> {
  const { width, height } = alertSize(orientation);
  return rasterize(alertNode(art, orientation), width, height);
}
