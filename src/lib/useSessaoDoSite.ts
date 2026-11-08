import { useEffect, useState } from "react";

/**
 * Usuário logado no site publicado (Etapa 1H), ou null.
 * Na VPS, o Nginx atende `_auth/me` com 200 e `{"usuario": "..."}` quando há sessão. No Vite local e no
 * build servido por um servidor estático simples o endereço não existe (o Vite devolve o index.html, o
 * servidor simples devolve 404), então só um JSON com `usuario` conta. O caminho é relativo à página, para
 * o build servido de uma subpasta não pedir nada fora dela.
 */
export function useSessaoDoSite(): string | null {
  const [usuario, setUsuario] = useState<string | null>(null);
  useEffect(() => {
    const controle = new AbortController();
    // Sem cabeçalho Accept de propósito: com "application/json" o Vite responde 404, e o Chrome registra
    // um erro no console; sem ele, o Vite devolve o index.html (200), descartado logo abaixo.
    fetch("_auth/me", { credentials: "same-origin", cache: "no-store", signal: controle.signal })
      .then(async (r) => {
        if (r.status !== 200 || !(r.headers.get("content-type") ?? "").includes("application/json")) return;
        const dados: unknown = await r.json();
        const nome = (dados as { usuario?: unknown } | null)?.usuario;
        if (typeof nome === "string" && nome) setUsuario(nome);
      })
      .catch(() => undefined);
    return () => controle.abort();
  }, []);
  return usuario;
}
