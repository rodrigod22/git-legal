"""Gera a narração dos vídeos de abertura com o Kokoro (modelo local, voz pt-br), sem conta nem rede.

Uso (dentro de videos/, com o ambiente virtual do README):
  npm run voz                          os seis módulos
  npm run voz -- trunk perigo          só esses
  npm run voz -- trunk --so-medir      mostra os tempos de cada fala sem gravar nada
  npm run voz -- --fonemas commit main mostra os fonemas pt-br de cada termo (para conferir a pronúncia)

Lê narracao/<modulo>.json (falas com início, limite e texto) e narracao/pronuncia.json (termos em inglês
reescritos como um dev brasileiro fala; a fonética pt-br lê "git" como "jítchi"). Grava
assets/audio/voz-<modulo>.wav (60 s, 24 kHz mono, ignorado pelo Git) e assets/audio/voz-<modulo>.m4a
(AAC, versionado), que a composição toca na trilha 3.

Cada fala precisa terminar pelo menos 0,3 s antes do seu limite ("fim"). Se não couber, o script avisa
"ESTOURA" e não grava: encurte o texto sem mudar o sentido; só depois acelere (campo "velocidade", até 1,1).
"""
import argparse
import json
import os
import re
import subprocess
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEXTOS = os.path.join(RAIZ, "narracao")
AUDIO = os.path.join(RAIZ, "assets", "audio")
MODELOS = os.environ.get("KOKORO_MODELOS", os.path.join(os.path.expanduser("~"), ".cache", "hyperframes", "tts"))
FFMPEG = os.environ.get("FFMPEG", "C:/ffmpeg/bin/ffmpeg.exe")
MODULOS = ["fundamentos", "branches", "merge", "conflitos", "trunk", "perigo"]
VOZ = "pm_santa"  # escolhida pelo Rodrigo em 08/11/2026, entre pf_dora, pm_alex e pm_santa
SR = 24000
DURACAO = 60
FOLGA = 0.3
VELOCIDADE_MAXIMA = 1.1
PICO = 0.89  # -1 dBFS

LETRA = "A-Za-zÀ-ÿ"


def carrega_pronuncia():
    with open(os.path.join(TEXTOS, "pronuncia.json"), encoding="utf-8") as f:
        return json.load(f)["termos"]


def pronuncia(texto, termos):
    # "--soft", "--no-ff", "--rebase": o traço duplo não se fala
    texto = re.sub(r"(?<![^ ])--(?=[a-z])", "", texto)
    for termo, troca in termos:
        texto = re.sub("(?<![" + LETRA + "])" + re.escape(termo) + "(?![" + LETRA + "])", troca, texto, flags=re.IGNORECASE)
    return texto


def abre_modelo():
    modelo = os.path.join(MODELOS, "models", "kokoro-v1.0.onnx")
    vozes = os.path.join(MODELOS, "voices", "voices-v1.0.bin")
    for arq in (modelo, vozes):
        if not os.path.exists(arq):
            sys.exit("falta " + arq + " (veja \"Narração\" no videos/README.md)")
    return Kokoro(modelo, vozes)


def gera(k, modulo, termos, voz, so_medir):
    with open(os.path.join(TEXTOS, modulo + ".json"), encoding="utf-8") as f:
        roteiro = json.load(f)
    trilha = np.zeros(SR * DURACAO, dtype=np.float32)
    problemas = 0
    fim_anterior = 0.0
    print("== " + modulo + " (voz " + voz + ")")
    for fala in roteiro["falas"]:
        ini, limite, texto = fala["inicio"], fala["fim"], fala["texto"]
        vel = fala.get("velocidade", roteiro.get("velocidade", 1.0))
        if vel > VELOCIDADE_MAXIMA:
            sys.exit(f"velocidade {vel} acima de {VELOCIDADE_MAXIMA} em {modulo} {ini} s")
        falado = pronuncia(texto, termos)
        a, sr = k.create(falado, voice=voz, speed=vel, lang="pt-br")
        assert sr == SR, sr
        termina = ini + len(a) / SR
        aviso = ""
        if termina > limite - FOLGA:
            aviso = f"  ESTOURA ({termina - (limite - FOLGA):+.2f} s)"
            problemas += 1
        if ini < fim_anterior:
            aviso += "  SOBREPÕE a fala anterior"
            problemas += 1
        print(f"  {ini:5.1f}-{termina:5.1f} s (limite {limite:4.1f}, sobra {limite - termina:4.1f}){aviso}  {falado}")
        i = int(ini * SR)
        trilha[i:i + len(a)] += a[: len(trilha) - i]
        fim_anterior = termina
    if problemas:
        print(f"  {problemas} problema(s): nada gravado para {modulo}")
        return False
    if so_medir:
        return True
    trilha *= PICO / np.max(np.abs(trilha))
    wav = os.path.join(AUDIO, "voz-" + modulo + ".wav")
    m4a = os.path.join(AUDIO, "voz-" + modulo + ".m4a")
    sf.write(wav, trilha, SR, subtype="PCM_16")
    r = subprocess.run([FFMPEG, "-y", "-v", "error", "-i", wav, "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", m4a])
    if r.returncode:
        sys.exit("ffmpeg falhou em " + m4a)
    print(f"  gravado voz-{modulo}.wav e voz-{modulo}.m4a ({os.path.getsize(m4a) / 1024:.0f} KB)")
    return True


def main():
    p = argparse.ArgumentParser(description="Narração dos vídeos de abertura (Kokoro local, pt-br)")
    p.add_argument("modulos", nargs="*", help="módulos (padrão: todos)")
    p.add_argument("--voz", default=VOZ)
    p.add_argument("--so-medir", action="store_true", help="só mostra os tempos, sem gravar")
    p.add_argument("--fonemas", nargs="+", metavar="TERMO", help="mostra os fonemas pt-br de cada termo, já com o dicionário aplicado")
    a = p.parse_args()
    termos = carrega_pronuncia()
    k = abre_modelo()
    if a.fonemas:
        for t in a.fonemas:
            falado = pronuncia(t, termos)
            print(f"{t:24s} -> {falado:24s} {k.tokenizer.phonemize(falado, 'pt-br')}")
        return
    pedidos = a.modulos or MODULOS
    for m in pedidos:
        if m not in MODULOS:
            sys.exit("módulo desconhecido: " + m)
    ok = all([gera(k, m, termos, a.voz, a.so_medir) for m in pedidos])
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
