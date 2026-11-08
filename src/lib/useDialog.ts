import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
// os toasts ficam fora da janela no DOM, mas entram na roda do Tab: o toast de conquista aparece junto com a janela de conclusão
const TOAST_FOCUSABLE = FOCUSABLE.split(", ").map((sel) => `.toasts ${sel}`).join(", ");

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
    const focusables = () => [...el.querySelectorAll<HTMLElement>(FOCUSABLE), ...document.querySelectorAll<HTMLElement>(TOAST_FOCUSABLE)].filter((f) => f.offsetParent !== null || f === document.activeElement);
    // Adiado para depois do evento que abriu a janela: se ela abre por um Enter no terminal, o Chrome ainda
    // entrega o keypress ao elemento recém-focado e acionaria o primeiro botão.
    const t = setTimeout(() => (initialFocus?.current ?? focusables()[0] ?? el).focus(), 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab") {
        // a roda é a janela mais os toasts; o Tab sempre anda dentro dela, com volta nas pontas
        const list = focusables();
        if (list.length === 0) return;
        const i = list.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        const next = i === -1 ? (e.shiftKey ? list.length - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + list.length) % list.length;
        list[next].focus();
      }
    };
    // no documento, e não só na janela, porque o foco pode estar num toast
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      if (before && document.contains(before)) before.focus();
    };
    // roda uma vez por abertura: os componentes que usam o hook só ficam montados enquanto a janela está aberta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
