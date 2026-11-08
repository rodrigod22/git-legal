import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { MODULES } from "./index";
import { VIDEOS, videoFor } from "./videos";

const publicDir = path.resolve(__dirname, "..", "..", "public");

describe("vídeos de abertura", () => {
  it("todo módulo tem um vídeo, e nenhum vídeo sobra", () => {
    expect(VIDEOS.map((v) => v.moduleId)).toEqual(MODULES.map((m) => m.id));
    for (const m of MODULES) expect(videoFor(m.id)?.file).toBe(`videos/${m.id}.mp4`);
  });
  it("as deixas cobrem os 60 s em ordem, sem buraco nem sobreposição", () => {
    for (const v of VIDEOS) {
      expect(v.cues[0].start, v.moduleId).toBe(0);
      expect(v.cues[v.cues.length - 1].end, v.moduleId).toBe(v.duration);
      for (let i = 1; i < v.cues.length; i++) expect(v.cues[i].start, `${v.moduleId} deixa ${i}`).toBe(v.cues[i - 1].end);
      for (const c of v.cues) expect(c.text.trim().length, v.moduleId).toBeGreaterThan(10);
    }
  });
  it("os arquivos do build existem em public/videos/ e a legenda bate com as deixas", () => {
    for (const v of VIDEOS) {
      for (const f of [v.file, v.poster, v.captions]) expect(existsSync(path.join(publicDir, f)), f).toBe(true);
      const vtt = readFileSync(path.join(publicDir, v.captions), "utf8");
      expect(vtt.startsWith("WEBVTT")).toBe(true);
      for (const c of v.cues) expect(vtt, v.captions).toContain(c.text);
    }
  });
  it("os vídeos ficam abaixo de 4 MB cada (CRF 24, com zoom de fundo e partículas: cerca de 3 MB)", () => {
    for (const v of VIDEOS) {
      const bytes = readFileSync(path.join(publicDir, v.file)).byteLength;
      expect(bytes, v.file).toBeLessThan(4 * 1024 * 1024);
    }
  });
});
