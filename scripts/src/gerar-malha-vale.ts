/**
 * Gera o mapa do Vale do Ribeira da landing a partir da malha do IBGE.
 *
 *   pnpm --filter @workspace/scripts run gerar:malha-vale
 *
 * Rodado à mão, só quando a lista de municípios mudar: o resultado é
 * commitado, e assim o build nunca depende da rede do IBGE nem muda de forma
 * sozinho quando eles republicam a malha.
 *
 * A malha vem por estado (o endpoint por região imediata responde 500) e é
 * filtrada pelos 24 códigos. A projeção é Mercator esférico normalizado pela
 * bbox dos municípios selecionados — o mapa é regional e pequeno, então não há
 * distorção que justifique uma projeção mais cara.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VALE_DO_RIBEIRA } from "@workspace/db/vale-do-ribeira";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SAIDA = join(AQUI, "..", "..", "artifacts", "signage", "src", "lib", "mapa-vale.ts");

const MALHA =
  "https://servicodados.ibge.gov.br/api/v3/malhas/estados/35" +
  "?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=municipio";

const LARGURA = 1000;

/**
 * As respostas do IBGE trazem caracteres de controle que quebram JSON.parse
 * estrito. Troca por espaço, não por vazio: se o caractere estava separando
 * dois tokens dentro de uma string, apagar sem deixar nada colaria as duas
 * partes. O range é escrito com sequência de escape, nunca com o caractere
 * literal — foi um caractere literal colado neste mesmo trecho, num plano
 * anterior, que corrompeu o arquivo do plano.
 */
async function baixarJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IBGE respondeu ${res.status} em ${url}`);
  const texto = await res.text();
  return JSON.parse(texto.replace(/[\u0000-\u001f]/g, " "));
}

/**
 * Mercator com o y em graus, não em radianos: o x do mapa é a longitude crua,
 * e misturar as duas unidades achata o desenho por um fator de 180/π.
 */
function mercatorY(latGraus: number): number {
  const lat = (latGraus * Math.PI) / 180;
  return (Math.log(Math.tan(Math.PI / 4 + lat / 2)) * 180) / Math.PI;
}

/** Um Polygon vira uma lista de anéis; um MultiPolygon, a concatenação dos anéis de cada parte. */
function aneis(geometry: any): number[][][] {
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  throw new Error(`Geometria inesperada: ${geometry.type}`);
}

async function main() {
  // Anotado como Map<string, string>: sem isso o TS infere a chave como a
  // união literal dos 24 códigos do `as const`, e as comparações com
  // `String(...)` abaixo (dado externo, não literal) não tipam.
  const porCodigo = new Map<string, string>(VALE_DO_RIBEIRA.map((m) => [m.ibge, m.nome]));
  const malha = await baixarJson(MALHA);

  const selecionados = malha.features.filter((f: any) =>
    porCodigo.has(String(f.properties.codarea)),
  );
  if (selecionados.length !== VALE_DO_RIBEIRA.length) {
    throw new Error(
      `Esperava ${VALE_DO_RIBEIRA.length} municípios na malha, achei ${selecionados.length}`,
    );
  }

  // bbox em coordenadas já projetadas: x = longitude, y = Mercator da latitude.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const feature of selecionados) {
    for (const anel of aneis(feature.geometry)) {
      for (const [lng, lat] of anel) {
        const y = mercatorY(lat);
        if (lng < minX) minX = lng;
        if (lng > maxX) maxX = lng;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const escala = LARGURA / (maxX - minX);
  const altura = Number(((maxY - minY) * escala).toFixed(2));

  // y invertido: no SVG cresce para baixo, no Mercator para cima (norte).
  const paraSvg = ([lng, lat]: number[]) =>
    `${((lng - minX) * escala).toFixed(2)} ${((maxY - mercatorY(lat)) * escala).toFixed(2)}`;

  const municipios = selecionados
    .map((feature: any) => {
      const ibge = String(feature.properties.codarea);
      const path = aneis(feature.geometry)
        .map((anel) => `M${anel.map(paraSvg).join("L")}Z`)
        .join("");
      return { ibge, nome: porCodigo.get(ibge)!, path };
    })
    .sort((a: any, b: any) => a.nome.localeCompare(b.nome, "pt-BR"));

  const linhas = municipios
    .map((m: any) => `  { ibge: '${m.ibge}', nome: ${JSON.stringify(m.nome)}, path: '${m.path}' },`)
    .join("\n");

  writeFileSync(
    SAIDA,
    `/**
 * ARQUIVO GERADO — não editar à mão.
 *
 * Fonte: malha municipal do IBGE (qualidade intermediária), projetada em
 * Mercator e normalizada para a viewBox abaixo.
 *
 * Regerar:
 *   pnpm --filter @workspace/scripts run gerar:malha-vale
 */
export interface MunicipioMapa {
  ibge: string;
  nome: string;
  /** Path SVG já projetado, na viewBox de VALE_VIEW_BOX. */
  path: string;
}

export const VALE_VIEW_BOX = '0 0 ${LARGURA} ${altura}';

export const VALE_MUNICIPIOS: MunicipioMapa[] = [
${linhas}
];
`,
    "utf8",
  );

  console.log(`Mapa gerado: ${municipios.length} municípios, viewBox 0 0 ${LARGURA} ${altura}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
