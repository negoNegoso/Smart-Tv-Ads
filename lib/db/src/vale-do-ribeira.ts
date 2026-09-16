/**
 * Municípios do Vale do Ribeira (recorte ampliado de bacia, não a região
 * imediata de Registro sozinha), por código IBGE.
 *
 * Vive em lib/db, e não no api-server, porque três pacotes precisam da mesma
 * lista: o servidor agrega por ela, o script que gera o mapa filtra a malha
 * IBGE por ela, e o teste do asset compara as duas pontas. O arquivo não
 * importa nada de banco — entra pelo subpath `@workspace/db/vale-do-ribeira`
 * justamente para não passar pelo index.ts, que lança sem DATABASE_URL.
 *
 * Mudar esta lista exige regerar o mapa:
 *   pnpm --filter @workspace/scripts run gerar:malha-vale
 */
export const VALE_DO_RIBEIRA = [
  { ibge: "3502705", nome: "Apiaí" },
  { ibge: "3505351", nome: "Barra do Chapéu" },
  { ibge: "3505401", nome: "Barra do Turvo" },
  { ibge: "3509254", nome: "Cajati" },
  { ibge: "3509908", nome: "Cananéia" },
  { ibge: "3514809", nome: "Eldorado" },
  { ibge: "3520301", nome: "Iguape" },
  { ibge: "3520426", nome: "Ilha Comprida" },
  { ibge: "3521200", nome: "Iporanga" },
  { ibge: "3522158", nome: "Itaoca" },
  { ibge: "3522653", nome: "Itapirapuã Paulista" },
  { ibge: "3523305", nome: "Itariri" },
  { ibge: "3524600", nome: "Jacupiranga" },
  { ibge: "3526100", nome: "Juquiá" },
  { ibge: "3526209", nome: "Juquitiba" },
  { ibge: "3529906", nome: "Miracatu" },
  { ibge: "3536208", nome: "Pariquera-Açu" },
  { ibge: "3537206", nome: "Pedro de Toledo" },
  { ibge: "3537602", nome: "Peruíbe" },
  { ibge: "3542602", nome: "Registro" },
  { ibge: "3542800", nome: "Ribeira" },
  { ibge: "3549953", nome: "São Lourenço da Serra" },
  { ibge: "3551801", nome: "Sete Barras" },
  { ibge: "3553500", nome: "Tapiraí" },
] as const;

export const VALE_DO_RIBEIRA_IBGE: readonly string[] = VALE_DO_RIBEIRA.map((m) => m.ibge);
