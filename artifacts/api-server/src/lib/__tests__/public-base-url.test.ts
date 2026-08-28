import { describe, expect, it } from "vitest";
import { publicBaseUrl } from "../public-base-url";

describe("publicBaseUrl", () => {
  it("prefere PUBLIC_BASE_URL sobre tudo", () => {
    const base = publicBaseUrl(
      { PUBLIC_BASE_URL: "https://painel.exemplo.com", VERCEL_PROJECT_PRODUCTION_URL: "app.vercel.app" },
      "https://preview-abc.vercel.app",
    );

    expect(base).toBe("https://painel.exemplo.com");
  });

  it("remove a barra final de PUBLIC_BASE_URL", () => {
    expect(publicBaseUrl({ PUBLIC_BASE_URL: "https://painel.exemplo.com/" }, "https://x")).toBe(
      "https://painel.exemplo.com",
    );
  });

  it("usa o domínio de produção da Vercel quando PUBLIC_BASE_URL falta", () => {
    const base = publicBaseUrl(
      { VERCEL_PROJECT_PRODUCTION_URL: "painel.vercel.app" },
      "https://preview-abc.vercel.app",
    );

    expect(base).toBe("https://painel.vercel.app");
  });

  it("cai na origem da requisição quando não há nenhuma variável", () => {
    expect(publicBaseUrl({}, "http://localhost:8080/")).toBe("http://localhost:8080");
  });

  it("trata string vazia como não definida", () => {
    expect(publicBaseUrl({ PUBLIC_BASE_URL: "", VERCEL_PROJECT_PRODUCTION_URL: "" }, "https://x")).toBe(
      "https://x",
    );
  });
});
