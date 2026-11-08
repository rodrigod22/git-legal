# Gera a trilha musical de cada vídeo e os efeitos sonoros, por síntese pura (numpy),
# sem amostras de terceiros: tudo o que sai daqui pertence ao projeto.
#
# Uso: python -I videos/ferramentas/gerar-audio.py [pasta-de-saida]   (padrão: videos/assets/audio)
# Saída: musica-<modulo>.wav (60 s, estéreo, 48 kHz) e sfx-*.wav. Os .wav da música são convertidos
# para .m4a por renderizar.mjs (ffmpeg), e só o .m4a entra no Git.
#
# Cada trilha tem a mesma arquitetura, com tom, andamento e timbre por módulo:
#   0–7 s   abertura: só o pad, subindo
#   7–18 s  situação: entra o piano elétrico (arpejo)
#   18–51 s desenvolvimento: baixo e percussão leve
#   51–60 s fechamento: percussão sai, pad desce
import sys, os, math, wave, struct
import numpy as np

SR = 48000
DUR = 60.0
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "assets", "audio")
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)

def t_axis(seg):
    return np.arange(int(seg * SR)) / SR

def nota(semitom, base=220.0):
    return base * 2 ** (semitom / 12)

def env(n, a, d, s, r, hold):
    """ADSR em amostras; hold é o tempo total com a tecla pressionada (s)."""
    t = np.arange(n) / SR
    e = np.zeros(n)
    a_n, d_n = int(a * SR), int(d * SR)
    h_n = max(int(hold * SR), a_n + d_n)
    e[:a_n] = np.linspace(0, 1, a_n, endpoint=False)
    e[a_n:a_n + d_n] = np.linspace(1, s, d_n, endpoint=False)
    e[a_n + d_n:h_n] = s
    rel = n - h_n
    if rel > 0:
        e[h_n:] = s * np.exp(-np.linspace(0, 6, rel) / max(r, 0.01) * 0.6)
    return e

def lowpass(x, corte, suavidade=1.0):
    """Passa-baixa por FFT com joelho suave (sem scipy)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = 1 / (1 + (f / corte) ** (4 * suavidade))
    return np.fft.irfft(X * g, n=len(x))

def highpass(x, corte):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = 1 - 1 / (1 + (f / corte) ** 4)
    return np.fft.irfft(X * g, n=len(x))

def reverb(x, tempo=1.6, mix=0.22, pre=0.02):
    """Convolução com uma resposta sintética: ruído com decaimento exponencial e filtro escurecendo no tempo."""
    n = int(tempo * SR)
    ir = rng.standard_normal(n) * np.exp(-np.linspace(0, 7, n))
    ir = lowpass(ir, 5000)
    ir[: int(pre * SR)] = 0
    ir /= np.sqrt(np.sum(ir ** 2)) * 6
    L = len(x) + n
    y = np.fft.irfft(np.fft.rfft(x, L) * np.fft.rfft(ir, L), n=L)[: len(x)]
    return x * (1 - mix) + y * mix

def soft(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)

def pad_voz(freq, seg, brilho):
    """Duas dentes de serra desafinadas + uma oitava abaixo em triângulo, filtradas; respiração lenta no filtro."""
    t = t_axis(seg)
    def saw(f):
        return 2 * ((t * f) % 1) - 1
    def tri(f):
        return 2 * np.abs(2 * ((t * f) % 1) - 1) - 1
    x = 0.5 * saw(freq * 1.003) + 0.5 * saw(freq * 0.997) + 0.35 * tri(freq / 2)
    x = lowpass(x, brilho, 0.8)
    return x

def pluck(freq, seg, cor=1.0):
    """Piano elétrico simples: fundamental + harmônicos decaindo mais rápido, leve trêmolo."""
    t = t_axis(seg)
    x = np.sin(2 * math.pi * freq * t) * np.exp(-t * 2.2)
    x += 0.35 * np.sin(2 * math.pi * freq * 2 * t + 0.3) * np.exp(-t * 4.5) * cor
    x += 0.12 * np.sin(2 * math.pi * freq * 3 * t) * np.exp(-t * 7) * cor
    x += 0.08 * np.sin(2 * math.pi * freq * 0.5 * t) * np.exp(-t * 1.8)
    x *= (1 + 0.06 * np.sin(2 * math.pi * 5.5 * t))
    x[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    return x

def baixo(freq, seg):
    t = t_axis(seg)
    x = np.sin(2 * math.pi * freq * t) + 0.25 * np.sin(2 * math.pi * freq * 2 * t) * np.exp(-t * 6)
    x *= np.exp(-t * 2.0)
    x[: int(0.006 * SR)] *= np.linspace(0, 1, int(0.006 * SR))
    return x

def bumbo(seg=0.35):
    t = t_axis(seg)
    f = 110 * np.exp(-t * 18) + 42
    x = np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
    return x

def chimbal(seg=0.08, brilho=9000):
    t = t_axis(seg)
    x = highpass(rng.standard_normal(len(t)), brilho) * np.exp(-t * 60)
    return lowpass(x, 14000) * 0.6

def chocalho(seg=0.12):
    t = t_axis(seg)
    x = highpass(rng.standard_normal(len(t)), 4000) * np.exp(-t * 25) * (1 - np.exp(-t * 200))
    return lowpass(x, 9000) * 0.5

def coloca(mix, x, inicio, ganho=1.0, pan=0.0):
    """Soma x (mono) no mix estéreo a partir de inicio (s), com pan de -1 a 1 (potência constante)."""
    i = int(inicio * SR)
    if i >= mix.shape[1]:
        return
    n = min(len(x), mix.shape[1] - i)
    ang = (pan + 1) * math.pi / 4
    mix[0, i:i + n] += x[:n] * ganho * math.cos(ang)
    mix[1, i:i + n] += x[:n] * ganho * math.sin(ang)

# ----------------------------------------------------------------------------------------------
# Estilos por módulo. Acordes em semitons a partir da tônica; cada acorde dura 2 compassos.
# ----------------------------------------------------------------------------------------------
MAIOR7 = [0, 4, 7, 11]
MENOR7 = [0, 3, 7, 10]
DOM7 = [0, 4, 7, 10]
SUS2 = [0, 2, 7]
ESTILOS = {
    # tônica (Hz da nota mais grave do pad), bpm, progressão (grau em semitons, tipo), brilho do pad, padrão do arpejo, percussão
    "fundamentos": dict(tonica=nota(-9, 220), bpm=84, prog=[(0, MAIOR7), (9, MENOR7), (5, MAIOR7), (7, SUS2)], brilho=1400, arpejo=[0, 1, 2, 1, 3, 2, 1, 2], perc="suave", cor=1.0),
    "branches":    dict(tonica=nota(-7, 220), bpm=96, prog=[(0, MAIOR7), (2, MENOR7), (9, MENOR7), (7, DOM7)], brilho=1800, arpejo=[0, 2, 1, 3, 0, 2, 3, 1], perc="leve", cor=1.1),
    "merge":       dict(tonica=nota(-5, 220), bpm=88, prog=[(0, MAIOR7), (4, MENOR7), (5, MAIOR7), (0, MAIOR7)], brilho=1600, arpejo=[0, 1, 3, 2, 0, 3, 1, 2], perc="suave", cor=0.9),
    "conflitos":   dict(tonica=nota(-12, 220), bpm=92, prog=[(0, MENOR7), (8, MAIOR7), (3, MAIOR7), (7, DOM7)], brilho=1100, arpejo=[0, 2, 1, 2, 3, 2, 1, 0], perc="tensa", cor=1.3),
    "trunk":       dict(tonica=nota(-4, 220), bpm=104, prog=[(0, MAIOR7), (5, MAIOR7), (9, MENOR7), (7, SUS2)], brilho=2200, arpejo=[0, 3, 1, 2, 0, 3, 2, 1], perc="ativa", cor=1.2),
    "perigo":      dict(tonica=nota(-14, 220), bpm=80, prog=[(0, MENOR7), (0, MENOR7), (5, MENOR7), (10, MAIOR7)], brilho=900, arpejo=[0, 1, 0, 2, 0, 1, 3, 2], perc="tensa", cor=1.4),
}

def musica(nome, e):
    n = int(DUR * SR)
    mix = np.zeros((2, n))
    batida = 60 / e["bpm"]
    compasso = 4 * batida
    dur_acorde = 2 * compasso
    tonica = e["tonica"]

    # Pad: cada acorde cruza em fade com o próximo
    t0 = 0.0
    k = 0
    while t0 < DUR:
        grau, tipo = e["prog"][k % len(e["prog"])]
        seg = dur_acorde + 1.2
        voz = np.zeros(int(seg * SR))
        for j, st in enumerate(tipo):
            f = nota(grau + st, tonica)
            voz += pad_voz(f, seg, e["brilho"]) * (0.9 if j == 0 else 0.7)
        voz *= env(len(voz), 1.2, 0.4, 0.85, 1.0, dur_acorde)
        coloca(mix, voz, t0, 0.055, pan=0.0)
        t0 += dur_acorde
        k += 1

    # Piano elétrico: arpejo em colcheias, de 7 s até o fim, com alternância de pan
    passo = batida / 2
    t = 7.0
    i = 0
    while t < DUR - 1.5:
        k = int(t // dur_acorde)
        grau, tipo = e["prog"][k % len(e["prog"])]
        idx = e["arpejo"][i % len(e["arpejo"])]
        oitava = 12 if idx >= len(tipo) else 12
        st = tipo[idx % len(tipo)] + (24 if idx >= 2 else 12)
        f = nota(grau + st, tonica)
        vel = 0.5 + 0.5 * (1 if i % 4 == 0 else 0.6) + 0.1 * rng.standard_normal()
        ganho = 0.12 * vel
        if t < 18:
            ganho *= 0.75
        if t > 51:
            ganho *= max(0.0, (60 - t) / 9)
        coloca(mix, pluck(f, 1.4, e["cor"]), t + rng.uniform(-0.004, 0.004), ganho, pan=(-0.35 if i % 2 == 0 else 0.35))
        t += passo
        i += 1

    # Baixo: tônica do acorde nos tempos 1 e 3, de 18 a 51 s, oitava abaixo do pad
    t = 18.0
    while t < 51.5:
        k = int(t // dur_acorde)
        grau, tipo = e["prog"][k % len(e["prog"])]
        f = nota(grau - 12, tonica)
        coloca(mix, baixo(f, batida * 1.8), t, 0.16)
        coloca(mix, baixo(f, batida * 0.9), t + 2 * batida, 0.11)
        if e["perc"] in ("ativa", "tensa"):
            coloca(mix, baixo(nota(grau - 12 + 7, tonica), batida * 0.6), t + 3.5 * batida, 0.07)
        t += compasso

    # Percussão leve: bumbo abafado, chimbal nos contratempos, chocalho
    if e["perc"] != "nenhuma":
        t = 18.0
        i = 0
        while t < 51.0:
            if e["perc"] in ("leve", "ativa", "tensa") and i % 2 == 0:
                coloca(mix, lowpass(bumbo(), 2200), t, 0.22 if e["perc"] != "suave" else 0.12)
            if i % 2 == 1:
                coloca(mix, chimbal(), t, 0.05 if e["perc"] == "suave" else 0.08, pan=0.4)
            if e["perc"] in ("ativa", "tensa") and i % 4 == 2:
                coloca(mix, chimbal(0.05), t + batida / 2, 0.04, pan=-0.4)
            coloca(mix, chocalho(), t + batida / 2, 0.035, pan=-0.5)
            t += batida
            i += 1

    # Ambiente: um sopro grave e contínuo, muito baixo, para colar tudo
    ar = lowpass(rng.standard_normal(n), 240) * 0.012
    mix[0] += ar
    mix[1] += ar

    # Dinâmica geral: entrada em 2 s, saída em 4 s
    g = np.ones(n)
    g[: int(2 * SR)] = np.linspace(0, 1, int(2 * SR))
    g[-int(4 * SR):] = np.linspace(1, 0, int(4 * SR))
    mix *= g

    # Reverb, compressão suave e normalização
    for c in range(2):
        mix[c] = reverb(mix[c], 1.8, 0.2)
    pico = np.max(np.abs(mix))
    mix = soft(mix / pico * 1.2, 1.3) * 0.75
    rms = np.sqrt(np.mean(mix ** 2))
    mix *= min(1.0, 10 ** (-18 / 20) / rms)
    escreve(os.path.join(OUT, f"musica-{nome}.wav"), mix)

def escreve(caminho, mix):
    mix = np.clip(mix, -1, 1)
    dados = (mix.T * 32767).astype("<i2").tobytes()
    with wave.open(caminho, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(dados)
    print("ok", os.path.basename(caminho), f"{os.path.getsize(caminho) / 1e6:.1f} MB")

def mono2(x):
    return np.vstack([x, x])

# ----------------------------------------------------------------------------------------------
# Efeitos sonoros
# ----------------------------------------------------------------------------------------------
def sfx_digitacao():
    """4 s de teclas: cliques curtos de ruído filtrado em intervalos irregulares."""
    n = int(4 * SR)
    x = np.zeros(n)
    t = 0.05
    while t < 3.9:
        seg = 0.03
        c = highpass(rng.standard_normal(int(seg * SR)), 1800) * np.exp(-t_axis(seg) * 220)
        c = lowpass(c, 6000 + rng.uniform(-1500, 1500))
        i = int(t * SR)
        x[i:i + len(c)] += c * rng.uniform(0.5, 1.0)
        t += rng.uniform(0.055, 0.11)
    x /= np.max(np.abs(x))
    return mono2(x * 0.5)

def sfx_enter():
    seg = 0.12
    t = t_axis(seg)
    x = highpass(rng.standard_normal(len(t)), 900) * np.exp(-t * 90) + 0.4 * np.sin(2 * math.pi * 160 * t) * np.exp(-t * 40)
    x = lowpass(x, 5000)
    return mono2(x / np.max(np.abs(x)) * 0.6)

def sfx_whoosh():
    seg = 0.7
    t = t_axis(seg)
    ruido = rng.standard_normal(len(t))
    X = np.fft.rfft(ruido)
    f = np.fft.rfftfreq(len(t), 1 / SR)
    # banda que sobe de 300 a 2500 Hz: aproximamos somando dois recortes
    g = np.exp(-((np.log(f + 1) - np.log(900)) ** 2) / 0.6)
    x = np.fft.irfft(X * g, n=len(t))
    x *= np.sin(math.pi * t / seg) ** 1.5
    return mono2(x / np.max(np.abs(x)) * 0.45)

def sfx_pop(f0=640, f1=320, seg=0.14):
    t = t_axis(seg)
    f = f0 * (f1 / f0) ** (t / seg)
    x = np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-t * 28)
    return mono2(x * 0.5)

def sfx_tick():
    seg = 0.06
    t = t_axis(seg)
    x = np.sin(2 * math.pi * 880 * t) * np.exp(-t * 70) * 0.4 + highpass(rng.standard_normal(len(t)), 3000) * np.exp(-t * 150) * 0.2
    return mono2(x)

def sfx_erro():
    """O mesmo desenho do som de conflito do Dojo (serra em 220 Hz), um pouco mais longo."""
    seg = 0.55
    t = t_axis(seg)
    def saw(f):
        return 2 * ((t * f) % 1) - 1
    x = saw(220) * np.exp(-t * 5) * (t < 0.28) + saw(165) * np.exp(-(t - 0.2) * 5) * (t >= 0.2)
    x = lowpass(x, 1800)
    return mono2(x / np.max(np.abs(x)) * 0.5)

def sfx_sucesso():
    """Arpejo ascendente em senos, como o som de conclusão do Dojo."""
    seg = 0.9
    x = np.zeros(int(seg * SR))
    for i, f in enumerate([523.25, 659.25, 783.99, 1046.5]):
        tt = t_axis(seg - i * 0.09)
        v = np.sin(2 * math.pi * f * tt) * np.exp(-tt * 4) * 0.35 + 0.1 * np.sin(2 * math.pi * 2 * f * tt) * np.exp(-tt * 9)
        x[int(i * 0.09 * SR):] += v
    x = reverb(x, 1.0, 0.25)
    return mono2(x / np.max(np.abs(x)) * 0.55)

def sfx_alerta():
    """Pulso grave e seco para a Zona de Perigo e para o push rejeitado."""
    seg = 0.6
    t = t_axis(seg)
    x = np.sin(2 * math.pi * 55 * t) * np.exp(-t * 6) + 0.3 * np.sin(2 * math.pi * 110 * t) * np.exp(-t * 10)
    x += lowpass(rng.standard_normal(len(t)), 400) * np.exp(-t * 20) * 0.5
    return mono2(x / np.max(np.abs(x)) * 0.6)

def sfx_deslize():
    """Varredura curta e aguda para setas e ponteiros se movendo."""
    seg = 0.4
    t = t_axis(seg)
    f = 400 * (1400 / 400) ** (t / seg)
    x = np.sin(2 * math.pi * np.cumsum(f) / SR) * np.sin(math.pi * t / seg) * 0.4
    x += highpass(rng.standard_normal(len(t)), 2500) * np.sin(math.pi * t / seg) * 0.15
    return mono2(x)

def sfx_logo():
    """Assinatura final: duas notas e um brilho."""
    seg = 1.6
    t = t_axis(seg)
    x = np.sin(2 * math.pi * 392 * t) * np.exp(-t * 3) * 0.4
    t2 = t_axis(seg - 0.18)
    x[int(0.18 * SR):] += (np.sin(2 * math.pi * 587.33 * t2) * np.exp(-t2 * 2.5) * 0.4 + 0.12 * np.sin(2 * math.pi * 1174.66 * t2) * np.exp(-t2 * 5))
    x = reverb(x, 1.4, 0.3)
    return mono2(x / np.max(np.abs(x)) * 0.5)

if __name__ == "__main__":
    for nome, e in ESTILOS.items():
        musica(nome, e)
    for nome, fn in {
        "digitacao": sfx_digitacao, "enter": sfx_enter, "whoosh": sfx_whoosh, "pop": sfx_pop, "tick": sfx_tick,
        "erro": sfx_erro, "sucesso": sfx_sucesso, "alerta": sfx_alerta, "deslize": sfx_deslize, "logo": sfx_logo,
    }.items():
        escreve(os.path.join(OUT, f"sfx-{nome}.wav"), fn())
