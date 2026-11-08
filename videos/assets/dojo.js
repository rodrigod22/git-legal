// Ajudantes das composições do Git Dojo. Tudo em uma timeline GSAP pausada,
// que o HyperFrames avança quadro a quadro (window.__timelines).
// Sem template literal em querySelector: o lint do HyperFrames recusa interpolação em seletores.
(function () {
  const SVG = "http://www.w3.org/2000/svg";
  const el = (nome) => document.querySelector('[data-anim="' + nome + '"]');

  function timeline() {
    return gsap.timeline({ paused: true });
  }
  function fim(tl, id) {
    window.__timelines = window.__timelines || {};
    window.__timelines[id || "main"] = tl;
    tl.seek(0);
    return tl;
  }

  // Entradas e saídas
  const entra = (tl, nome, t, extra) => tl.fromTo(el(nome), { opacity: 0, y: 24 }, Object.assign({ opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, extra || {}), t);
  const entraX = (tl, nome, t, dx, extra) => tl.fromTo(el(nome), { opacity: 0, x: dx }, Object.assign({ opacity: 1, x: 0, duration: 0.55, ease: "power3.out" }, extra || {}), t);
  const salta = (tl, nome, t, extra) => tl.fromTo(el(nome), { opacity: 0, scale: 0.7 }, Object.assign({ opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.6)" }, extra || {}), t);
  const some = (tl, nome, t, dur) => tl.to(el(nome), { opacity: 0, duration: dur || 0.4, ease: "power2.in" }, t);
  const pulsa = (tl, nome, t) => tl.fromTo(el(nome), { scale: 1 }, { scale: 1.06, duration: 0.18, yoyo: true, repeat: 1, ease: "power1.inOut" }, t);
  const treme = (tl, alvo, t) => tl.fromTo(alvo, { x: 0 }, { x: 8, duration: 0.06, yoyo: true, repeat: 5, ease: "power1.inOut" }, t);

  // Troca de cena: a atual escurece e encolhe de leve, a varredura de luz cruza a tela
  function sai(tl, seletor, t) {
    tl.to(seletor, { opacity: 0, scale: 0.985, duration: 0.5, ease: "power2.in" }, t);
    const v = document.querySelector(".varredura");
    if (v) tl.fromTo(v, { x: 0, opacity: 0 }, { x: 1800, opacity: 1, duration: 0.9, ease: "power2.inOut" }, t + 0.1).to(v, { opacity: 0, duration: 0.2 }, t + 0.85);
  }
  // Câmera: zoom lento no fundo durante a cena inteira
  function camera(tl, t0, t1, de, para) {
    tl.fromTo(".fundo", { scale: de || 1 }, { scale: para || 1.05, duration: t1 - t0, ease: "none" }, t0);
  }
  function barra(tl, dur) {
    const b = document.querySelector(".progresso i");
    if (b) tl.fromTo(b, { scaleX: 0 }, { scaleX: 1, duration: dur, ease: "none" }, 0);
  }

  // Partículas: pontos pequenos que sobem devagar, com brilho da cor do módulo
  function particulas(tl, n, dur) {
    const c = document.querySelector(".particulas");
    if (!c) return;
    for (let i = 0; i < n; i++) {
      const p = document.createElement("i");
      const tam = 3 + ((i * 7) % 5);
      p.style.width = tam + "px";
      p.style.height = tam + "px";
      p.style.left = ((i * 173) % 1280) + "px";
      p.style.top = 720 + ((i * 97) % 300) + "px";
      p.style.opacity = String(0.25 + ((i * 13) % 50) / 100);
      c.appendChild(p);
      tl.to(p, { y: -(1100 + ((i * 53) % 400)), x: ((i % 2 ? 1 : -1) * ((i * 31) % 90)), duration: dur, ease: "none" }, -((i * 2.3) % dur));
    }
  }

  // Digitação por caractere, determinística no tempo
  function digita(tl, id, texto, t, dur) {
    const alvo = document.getElementById(id);
    const estado = { n: 0 };
    tl.set(alvo, { textContent: "" }, t);
    tl.to(estado, { n: texto.length, duration: dur, ease: "none", onUpdate: () => { alvo.textContent = texto.slice(0, Math.round(estado.n)); } }, t);
  }

  // ---------------------------------------------------------------------------
  // Grafo de commits em SVG.
  // spec: { largura, altura, nos: [{id,x,y,cor,rotulo,quadrado}], arestas: [{id,de,para,cor,curva,tracejada}],
  //         tags: [{id,no,texto,cor,dx,dy}] }
  // Cada item recebe data-anim="<prefixo>-<id>" para a timeline achar.
  // ---------------------------------------------------------------------------
  function grafo(container, spec, prefixo) {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("class", "grafo");
    svg.setAttribute("viewBox", "0 0 " + spec.largura + " " + spec.altura);
    svg.setAttribute("width", spec.largura);
    svg.setAttribute("height", spec.altura);
    const pos = {};
    spec.nos.forEach((n) => (pos[n.id] = n));
    const g1 = document.createElementNS(SVG, "g");
    const g2 = document.createElementNS(SVG, "g");
    const g3 = document.createElementNS(SVG, "g");
    svg.appendChild(g1); svg.appendChild(g2); svg.appendChild(g3);

    (spec.arestas || []).forEach((a) => {
      const de = pos[a.de], para = pos[a.para];
      const p = document.createElementNS(SVG, "path");
      let d;
      if (a.curva) {
        const mx = (de.x + para.x) / 2;
        d = "M" + de.x + " " + de.y + " C" + mx + " " + de.y + ", " + mx + " " + para.y + ", " + para.x + " " + para.y;
      } else {
        d = "M" + de.x + " " + de.y + " L" + para.x + " " + para.y;
      }
      p.setAttribute("d", d);
      p.setAttribute("class", "aresta" + (a.tracejada ? " tracejada" : ""));
      p.setAttribute("stroke", a.cor);
      p.setAttribute("fill", "none");
      p.setAttribute("stroke-width", "6");
      p.setAttribute("stroke-linecap", "round");
      if (a.tracejada) p.setAttribute("stroke-dasharray", "10 12");
      p.setAttribute("data-anim", prefixo + "-" + a.id);
      // O desenho progressivo usa um clipPath que cresce da origem ao destino, em vez de stroke-dasharray:
      // o render do HyperFrames não mostrava as arestas animadas por dash, embora o Chrome puro mostrasse.
      const clipId = prefixo + "-" + a.id + "-clip";
      const clip = document.createElementNS(SVG, "clipPath");
      clip.setAttribute("id", clipId);
      const rect = document.createElementNS(SVG, "rect");
      const x0 = Math.min(de.x, para.x) - 12, x1 = Math.max(de.x, para.x) + 12;
      const y0 = Math.min(de.y, para.y) - 60, y1 = Math.max(de.y, para.y) + 60;
      const invertido = para.x < de.x;
      rect.setAttribute("x", invertido ? x1 : x0); rect.setAttribute("y", y0);
      rect.setAttribute("width", x1 - x0); rect.setAttribute("height", y1 - y0);
      rect.setAttribute("data-anim", clipId);
      rect.setAttribute("data-largura", String(x1 - x0));
      rect.setAttribute("data-x0", String(x0));
      rect.setAttribute("data-invertido", invertido ? "1" : "0");
      clip.appendChild(rect);
      const wrap = document.createElementNS(SVG, "g");
      wrap.setAttribute("clip-path", "url(#" + clipId + ")");
      wrap.appendChild(clip);
      wrap.appendChild(p);
      g1.appendChild(wrap);
    });

    spec.nos.forEach((n) => {
      const g = document.createElementNS(SVG, "g");
      g.setAttribute("data-anim", prefixo + "-" + n.id);
      g.setAttribute("style", "transform-origin: " + n.x + "px " + n.y + "px; color: " + n.cor);
      g.setAttribute("class", "brilho");
      let forma;
      const r = n.r || 16;
      if (n.quadrado) {
        forma = document.createElementNS(SVG, "rect");
        forma.setAttribute("x", n.x - r); forma.setAttribute("y", n.y - r);
        forma.setAttribute("width", 2 * r); forma.setAttribute("height", 2 * r);
        forma.setAttribute("rx", 6);
      } else {
        forma = document.createElementNS(SVG, "circle");
        forma.setAttribute("cx", n.x); forma.setAttribute("cy", n.y); forma.setAttribute("r", r);
      }
      forma.setAttribute("class", "no");
      forma.setAttribute("fill", n.cor);
      g.appendChild(forma);
      if (n.rotulo) {
        const tx = document.createElementNS(SVG, "text");
        tx.setAttribute("x", n.x); tx.setAttribute("y", n.y + r + 28);
        tx.setAttribute("class", "no-rotulo");
        tx.textContent = n.rotulo;
        g.appendChild(tx);
      }
      g2.appendChild(g);
    });

    (spec.tags || []).forEach((t) => {
      const n = pos[t.no];
      const g = document.createElementNS(SVG, "g");
      g.setAttribute("class", "tag");
      g.setAttribute("data-anim", prefixo + "-" + t.id);
      const w = t.texto.length * 13.5 + 28, h = 40;
      const dy = t.dy === undefined ? -62 : t.dy;
      const x = n.x + (t.dx || 0) - w / 2, y = n.y + dy - h / 2;
      g.setAttribute("style", "transform-origin: " + (x + w / 2) + "px " + (y + h / 2) + "px");
      const r = document.createElementNS(SVG, "rect");
      r.setAttribute("x", x); r.setAttribute("y", y); r.setAttribute("width", w); r.setAttribute("height", h);
      r.setAttribute("stroke", t.cor);
      const tx = document.createElementNS(SVG, "text");
      tx.setAttribute("x", x + w / 2); tx.setAttribute("y", y + h / 2);
      tx.setAttribute("fill", t.cor);
      tx.textContent = t.texto;
      g.appendChild(r); g.appendChild(tx);
      // ponteiro: linha curta da tag até o nó
      const lin = document.createElementNS(SVG, "line");
      // ponteiro: de cima ou de baixo da etiqueta até o nó; etiqueta ao lado (dy 0) aponta pela borda interna
      const lado = dy === 0 ? (t.dx > 0 ? -1 : 1) : 0;
      const ay = lado ? y + h / 2 : dy > 0 ? y : y + h;
      const ax = lado ? (lado < 0 ? x : x + w) : n.x + (t.dx || 0);
      lin.setAttribute("x1", ax); lin.setAttribute("y1", ay);
      lin.setAttribute("x2", lado ? n.x + lado * -18 : n.x); lin.setAttribute("y2", lado ? n.y : n.y + (dy > 0 ? 18 : -18));
      lin.setAttribute("stroke", t.cor); lin.setAttribute("stroke-width", 2.5); lin.setAttribute("opacity", 0.7);
      g.appendChild(lin);
      g3.appendChild(g);
    });

    (spec.textos || []).forEach((t) => {
      const tx = document.createElementNS(SVG, "text");
      tx.setAttribute("x", t.x); tx.setAttribute("y", t.y);
      tx.setAttribute("class", "texto");
      if (t.cor) tx.setAttribute("fill", t.cor);
      if (t.ancora) tx.setAttribute("text-anchor", t.ancora);
      tx.setAttribute("data-anim", prefixo + "-" + t.id);
      tx.textContent = t.texto;
      g3.appendChild(tx);
    });

    container.appendChild(svg);
    return svg;
  }

  // Animações do grafo
  function desenha(tl, nome, t, dur) {
    const p = el(nome);
    const rect = el(nome + "-clip");
    const largura = Number(rect.getAttribute("data-largura"));
    const x0 = Number(rect.getAttribute("data-x0"));
    const invertido = rect.getAttribute("data-invertido") === "1";
    tl.set(p, { opacity: 1 }, t);
    if (invertido) return tl.fromTo(rect, { attr: { x: x0 + largura, width: 0 } }, { attr: { x: x0, width: largura }, duration: dur || 0.5, ease: "power2.inOut" }, t);
    return tl.fromTo(rect, { attr: { width: 0 } }, { attr: { width: largura }, duration: dur || 0.5, ease: "power2.inOut" }, t);
  }
  const noEntra = (tl, nome, t) => tl.fromTo(el(nome), { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, t);
  const tagEntra = (tl, nome, t) => tl.fromTo(el(nome), { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, t);
  const move = (tl, nome, t, dx, dy, dur) => tl.to(el(nome), { x: dx, y: dy || 0, duration: dur || 0.8, ease: "power3.inOut" }, t);
  const escondeTudo = (tl, nomes, t) => nomes.forEach((n) => tl.set(el(n), { opacity: 0 }, t));

  // Ícones dos módulos (lucide, o mesmo desenho do Dojo)
  const ICONES = {
    sprout: '<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>',
    "git-branch": '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
    "git-merge": '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    check: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  };
  function icone(nome, cor) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="' + cor + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONES[nome] + "</svg>";
  }
  function montaIcones() {
    document.querySelectorAll("[data-icone]").forEach((n) => {
      n.innerHTML = icone(n.getAttribute("data-icone"), n.getAttribute("data-cor") || "currentColor");
    });
  }

  window.dojo = { el, timeline, fim, entra, entraX, salta, some, pulsa, treme, sai, camera, barra, particulas, digita, grafo, desenha, noEntra, tagEntra, move, escondeTudo, icone, montaIcones };
})();
