import { rasterize } from "../panels/render";
import { alertSize } from "../alerts/alert-template";
import { weatherNode, type WeatherArt, type WeatherOrientation } from "./weather-template";

/** PNG do slide de clima, nos mesmos tamanhos das outras artes geradas. */
export async function renderWeather(art: WeatherArt, orientation: WeatherOrientation): Promise<Buffer> {
  const { width, height } = alertSize(orientation);
  return rasterize(weatherNode(art, orientation), width, height);
}
