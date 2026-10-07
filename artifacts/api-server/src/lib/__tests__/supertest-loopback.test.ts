import http from "node:http";
import { describe, expect, it } from "vitest";
import request from "supertest";

// O supertest original escuta com listen(0) no wildcard (::) e conecta em
// 127.0.0.1. No macOS o SO pode entregar uma porta que outro processo da
// máquina (IDE, Docker…) já segura em 127.0.0.1 — e a conexão cai nesse outro
// processo (404 ou ECONNRESET intermitentes). O setup em src/test/supertest-loopback.ts
// faz o servidor efêmero escutar no próprio 127.0.0.1, onde o SO não repete porta.
describe("servidor efêmero do supertest", () => {
  it("escuta em 127.0.0.1, o mesmo endereço em que o supertest conecta", async () => {
    let address: unknown;
    const app = http.createServer((req, res) => {
      address = req.socket.localAddress;
      res.end("ok");
    });
    const res = await request(app).get("/").query({ a: "1" });
    expect(res.status).toBe(200);
    expect(res.text).toBe("ok");
    expect(address).toBe("127.0.0.1");
  });

  it("não deixa o servidor efêmero aberto depois da resposta", async () => {
    const app = http.createServer((_req, res) => res.end("ok"));
    const test = request(app).get("/");
    await test;
    expect((test as unknown as { _server: http.Server })._server.listening).toBe(false);
  });
});
