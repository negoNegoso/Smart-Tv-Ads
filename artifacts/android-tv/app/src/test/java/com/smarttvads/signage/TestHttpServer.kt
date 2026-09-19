package com.smarttvads.signage

import java.io.BufferedReader
import java.io.Closeable
import java.io.InputStreamReader
import java.net.InetAddress
import java.net.ServerSocket
import java.util.Collections
import kotlin.concurrent.thread

/**
 * Servidor HTTP mínimo para os testes. O JDK traz o com.sun.net.httpserver,
 * mas ele não entra no classpath de compilação dos testes do Android (a AGP
 * compila contra um JDK reduzido), então um ServerSocket resolve: só
 * precisamos de GET, 302 e 404.
 */
class TestHttpServer : Closeable {
    private val socket = ServerSocket(0, 0, InetAddress.getByName("127.0.0.1"))
    private val arquivos = Collections.synchronizedMap(mutableMapOf<String, ByteArray>())

    /** Caminhos pedidos, na ordem: os testes conferem que não houve download repetido. */
    val pedidos: MutableList<String> = Collections.synchronizedList(mutableListOf())

    val port: Int get() = socket.localPort

    /** Base que imita `releases/latest/download/`: /rel/<arquivo> redireciona para /real/<arquivo>. */
    val baseUrl: String get() = "http://127.0.0.1:$port/rel/"

    fun put(nome: String, corpo: ByteArray) {
        arquivos[nome] = corpo
    }

    init {
        thread(isDaemon = true) {
            while (!socket.isClosed) {
                val client = try { socket.accept() } catch (e: Exception) { break }
                client.use {
                    val leitor = BufferedReader(InputStreamReader(it.getInputStream()))
                    val linha = leitor.readLine() ?: return@use
                    val caminho = linha.split(" ").getOrElse(1) { "/" }
                    pedidos += caminho
                    while (true) {
                        val h = leitor.readLine()
                        if (h.isNullOrEmpty()) break
                    }
                    val saida = it.getOutputStream()
                    when {
                        caminho.startsWith("/rel/") -> {
                            val destino = "http://127.0.0.1:$port/real/" + caminho.removePrefix("/rel/")
                            saida.write(
                                ("HTTP/1.1 302 Found\r\nLocation: $destino\r\n" +
                                    "Content-Length: 0\r\nConnection: close\r\n\r\n").toByteArray()
                            )
                        }
                        arquivos.containsKey(caminho.removePrefix("/real/")) -> {
                            val corpo = arquivos.getValue(caminho.removePrefix("/real/"))
                            saida.write(
                                ("HTTP/1.1 200 OK\r\nContent-Length: ${corpo.size}\r\n" +
                                    "Connection: close\r\n\r\n").toByteArray()
                            )
                            saida.write(corpo)
                        }
                        else -> saida.write(
                            "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray()
                        )
                    }
                    saida.flush()
                }
            }
        }
    }

    override fun close() {
        socket.close()
    }
}
