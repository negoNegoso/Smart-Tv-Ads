import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Servidor efêmero do supertest em 127.0.0.1 — sem isto, a porta pode
    // colidir com outro processo da máquina e a requisição volta 404 ou
    // ECONNRESET de forma intermitente (ver o próprio arquivo).
    setupFiles: ["src/test/supertest-loopback.ts"],
    // Os testes são mockados (sem banco, sem rede) e passam quase
    // instantaneamente sozinhos; o padrão de 5s do Vitest só estoura sob
    // contenção de CPU quando a suíte inteira roda em paralelo (ex.: os
    // testes de render, satori + resvg, competindo com outros workers).
    // Isso mede a máquina, não o código — subir o teto evita falsos
    // negativos intermitentes sem mascarar um teste genuinamente lento.
    testTimeout: 15000,
  },
});
