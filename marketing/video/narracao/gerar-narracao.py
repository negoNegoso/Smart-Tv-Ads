#!/usr/bin/env python3
"""
Gera a narração do vídeo com a voz neural Kokoro (roda local, sem serviço
externo), já encaixada no tempo de cada cena.

    python3 marketing/video/narracao/gerar-narracao.py --voz pm_alex

Requisitos: `pip install kokoro-onnx soundfile` e os arquivos do modelo
(kokoro-v1.0.onnx e voices-v1.0.bin, das releases de thewh1teagle/kokoro-onnx
no GitHub) na pasta indicada por --modelo. Eles não vão para o git: são
~350 MB e só servem para gerar o áudio.

Saída: assets/narracao.ogg (a faixa inteira de 25 s) e src/narracao.js (os
trechos com fala, que a trilha usa para abaixar a música por baixo da voz).
"""

import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

AQUI = Path(__file__).resolve().parent
VIDEO = AQUI.parent
DURACAO = 25.0

# (início em segundos, tempo máximo da fala, texto). O início acompanha a
# entrada de cada cena; o tempo máximo impede a fala de invadir a próxima.
# Números e siglas vão por extenso para a voz não soletrar errado.
FALAS = [
    (0.7, 3.1, "Seu cliente está olhando pra uma tela agora."),
    (4.25, 2.8, "Anuncie nas telas do comércio do Vale do Ribeira."),
    (7.25, 3.1, "Por cento e cinquenta reais por mês. No anual, cento e vinte."),
    # Um trecho por card dos diferenciais (cada card dura 1,6 s).
    (10.65, 1.55, "Quê erre code prova o resultado."),
    (12.25, 1.55, "Concorrente não divide a tela."),
    (13.85, 1.55, "Você escolhe o alvo."),
    (15.45, 1.55, "Relatório por anúncio."),
    (17.45, 2.5, "Tem um espaço? Vire ponto parceiro. É grátis!"),
    (20.1, 2.2, "Pronto pra aparecer? Chama no zap!"),
    (22.4, 2.55, "Treze, nove nove sete quatro sete, oito seis nove cinco."),
]

VELOCIDADE = 1.1
VELOCIDADE_MAX = 1.4


def aparar(audio, taxa, limiar=0.01):
    """Tira o silêncio das pontas para a fala começar no tempo exato."""
    ativo = np.where(np.abs(audio) > limiar)[0]
    if len(ativo) == 0:
        return audio
    margem = int(taxa * 0.02)
    return audio[max(0, ativo[0] - margem): ativo[-1] + margem]


def falar(kokoro, texto, voz, janela):
    """
    Gera a fala na menor velocidade que cabe na janela. Sobe de 0,05 em 0,05
    porque a duração do Kokoro não é proporcional à velocidade: um salto
    calculado costuma acelerar mais que o necessário.
    """
    velocidade = VELOCIDADE
    while True:
        audio, taxa = kokoro.create(texto, voice=voz, speed=velocidade, lang="pt-br")
        audio = aparar(audio, taxa)
        dur = len(audio) / taxa
        if dur <= janela or velocidade >= VELOCIDADE_MAX:
            return audio, taxa, dur, velocidade
        velocidade = min(VELOCIDADE_MAX, round(velocidade + 0.05, 2))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--voz", default="pm_alex")
    p.add_argument("--modelo", default=str(AQUI / "modelo"))
    p.add_argument("--ffmpeg", default="ffmpeg")
    p.add_argument("--saida", default=str(VIDEO / "assets" / "narracao.ogg"))
    p.add_argument("--js", default=str(VIDEO / "src" / "narracao.js"))
    a = p.parse_args()

    kokoro = Kokoro(f"{a.modelo}/kokoro-v1.0.onnx", f"{a.modelo}/voices-v1.0.bin")
    taxa = 24000
    faixa = np.zeros(int(DURACAO * taxa), dtype=np.float32)
    trechos = []
    for inicio, janela, texto in FALAS:
        audio, taxa, dur, vel = falar(kokoro, texto, a.voz, janela)
        i = int(inicio * taxa)
        faixa[i: i + len(audio)] += audio[: len(faixa) - i]
        trechos.append({"t": inicio, "duracao": round(dur, 3), "texto": texto})
        aviso = "  <- não coube!" if dur > janela else ""
        print(f"{inicio:6.2f}s  {dur:4.2f}/{janela:4.2f}s  vel {vel:.2f}  {texto}{aviso}")

    # Normaliza o pico em -1 dB: o volume final é ajustado na mixagem.
    faixa *= 0.89 / max(1e-6, float(np.max(np.abs(faixa))))
    wav = Path(a.saida).with_suffix(".wav")
    sf.write(wav, faixa, taxa)
    subprocess.run(
        [a.ffmpeg, "-loglevel", "error", "-y", "-i", str(wav), "-c:a", "libopus", "-b:a", "64k", a.saida],
        check=True,
    )
    wav.unlink()

    Path(a.js).write_text(
        "'use strict';\n"
        "/**\n"
        " * Trechos com fala na narração (gerado por narracao/gerar-narracao.py,\n"
        f" * voz {a.voz}). A trilha abaixa a música durante cada trecho.\n"
        " */\n"
        f"const NARRACAO = {json.dumps(trechos, ensure_ascii=False, indent=2)};\n",
        encoding="utf-8",
    )
    print(f"Narração: {a.saida}")


if __name__ == "__main__":
    main()
