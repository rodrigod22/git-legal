# Gera os efeitos sonoros dos vídeos, por síntese pura (numpy), sem amostras de terceiros:
# tudo o que sai daqui pertence ao projeto.
#
# Uso: python -I videos/ferramentas/gerar-audio.py [pasta-de-saida]   (padrão: videos/assets/audio)
# Saída: sfx-*.wav (48 kHz), versionados.
#
# Até 08/11/2026 este script também gerava uma trilha musical por módulo (musica-<modulo>); o Rodrigo
# preferiu os vídeos só com voz e efeitos, e a música saiu (está no histórico do Git, se voltar).
# Regerar os efeitos agora dá ruído um pouco diferente do versionado (a música consumia o mesmo
# gerador aleatório antes deles): só regere se for mudar um efeito.
import sys, os, math, wave, struct
import numpy as np

SR = 48000
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "assets", "audio")
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)

def t_axis(seg):
    return np.arange(int(seg * SR)) / SR

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
    for nome, fn in {
        "digitacao": sfx_digitacao, "enter": sfx_enter, "whoosh": sfx_whoosh, "pop": sfx_pop, "tick": sfx_tick,
        "erro": sfx_erro, "sucesso": sfx_sucesso, "alerta": sfx_alerta, "deslize": sfx_deslize, "logo": sfx_logo,
    }.items():
        escreve(os.path.join(OUT, f"sfx-{nome}.wav"), fn())
