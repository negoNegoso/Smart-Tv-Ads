import type { Server } from "node:http";
import { Server as TlsServer } from "node:tls";
import supertest from "supertest";

/**
 * Faz o servidor efêmero do supertest escutar em 127.0.0.1 em vez do wildcard.
 *
 * O supertest 7 chama `app.listen(0)` (wildcard `::`) e conecta em
 * `127.0.0.1:<porta>`. No macOS (SO_REUSEADDR, que o libuv liga sempre) o SO
 * pode devolver ao wildcard uma porta que outro processo da máquina já segura
 * em 127.0.0.1 — IDE, Android Studio, OrbStack… — e o endereço específico
 * ganha a conexão: a requisição do teste cai nesse outro processo e volta 404
 * ou ECONNRESET, de forma intermitente e em qualquer arquivo que use supertest.
 * Escutando no próprio 127.0.0.1, o SO só entrega porta livre nesse endereço.
 *
 * `listen` com host é assíncrono (passa pelo dns.lookup), então a URL com a
 * porta só é montada no `end()`, depois do evento `listening`.
 */
type TestInternals = {
  app: Server;
  url: string;
  _server?: Server;
  _loopbackPath?: string;
  serverAddress(app: Server, path: string): string;
  end(fn?: (err: unknown, res: unknown) => void): unknown;
};

const PATCHED = Symbol.for("smart-tv-ads.supertest-loopback");
const proto = (supertest as unknown as { Test: { prototype: TestInternals & { [PATCHED]?: true } } }).Test
  .prototype;

if (!proto[PATCHED]) {
  proto[PATCHED] = true;
  const originalServerAddress = proto.serverAddress;
  const originalEnd = proto.end;

  proto.serverAddress = function (this: TestInternals, app: Server, path: string): string {
    // Servidor já escutando (o teste escolheu o endereço): comportamento original.
    if (app.address()) return originalServerAddress.call(this, app, path);
    this._server = app.listen(0, "127.0.0.1");
    this._loopbackPath = path;
    return `http://127.0.0.1${path}`;
  };

  proto.end = function (this: TestInternals, fn) {
    const server = this._server;
    if (server && this._loopbackPath !== undefined && !server.listening) {
      const finish = (err?: Error) => {
        server.off("listening", finish);
        server.off("error", finish);
        if (err) {
          fn?.(err, undefined);
          return;
        }
        const { port } = server.address() as { port: number };
        const protocol = this.app instanceof TlsServer ? "https" : "http";
        this.url = `${protocol}://127.0.0.1:${port}${this._loopbackPath}`;
        originalEnd.call(this, fn);
      };
      server.once("listening", finish);
      server.once("error", finish);
      return this;
    }
    return originalEnd.call(this, fn);
  };
}
