import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Comportamento de teclado de uma janela modal: move o foco para dentro ao abrir,
 * mantém o Tab circulando dentro dela, fecha com Escape e devolve o foco ao fechar.
 */
export function useDialog(ref: RefObject<HTMLElement>, opts: { onClose?: () => void; initialFocus?: RefObject<HTMLElement> } = {}) {
  const { onClose, initialFocus } = opts;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const before = document.activeElement as HTMLElement | null;
    const focusables = () => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((f) => f.offsetParent !== null || f === document.activeElement);
    // Adiado para depois do evento que abriu a janela: se ela abre por um Enter no terminal, o Chrome ainda
    // entrega o keypress ao elemento recém-focado e acionaria o primeiro botão.
    const t = setTimeout(() => (initialFocus?.current ?? focusables()[0] ?? el).focus(), 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab") {
        const list = focusables();
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    el.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      el.removeEventListener("keydown", onKey);
      if (before && document.contains(before)) before.focus();
    };
    // roda uma vez por abertura: os componentes que usam o hook só ficam montados enquanto a janela está aberta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
