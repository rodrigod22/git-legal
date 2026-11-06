/** Hash determinístico (FNV-1a 32 bits, duas rodadas) — gera "shas" de 40 hex como o Git. */
export function hashString(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + c * 0x9e3779b1) >>> 0;
    h2 ^= h2 >>> 13;
  }
  let out = "";
  let a = h1;
  let b = h2;
  for (let i = 0; i < 5; i++) {
    a = Math.imul(a ^ (a >>> 16), 0x45d9f3b) >>> 0;
    b = Math.imul(b ^ (b >>> 15), 0x2c1b3c6d) >>> 0;
    out += ((a ^ b) >>> 0).toString(16).padStart(8, "0");
  }
  return out.slice(0, 40);
}

export function short(sha: string): string {
  return sha.slice(0, 7);
}
