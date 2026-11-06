import { Fragment } from "react";

/** Renderiza texto com **negrito** e `código`. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) return <b key={i}>{p.slice(2, -2)}</b>;
        if (p.startsWith("`") && p.endsWith("`")) return <code key={i}>{p.slice(1, -1)}</code>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

/** Renderiza a marcação de cores do terminal (<r>, <g>, <y>, <c>, <m>, <b>, <d>). */
export function TermText({ text }: { text: string }) {
  const tokens = text.split(/(<\/?[rgycmbd]>)/g);
  const stack: string[] = [];
  const out: React.ReactNode[] = [];
  tokens.forEach((t, i) => {
    const open = t.match(/^<([rgycmbd])>$/);
    const close = t.match(/^<\/([rgycmbd])>$/);
    if (open) stack.push(open[1]);
    else if (close) stack.pop();
    else if (t) {
      const cls = stack.map((s) => `t-${s}`).join(" ");
      const txt = t.replace(/&lt;/g, "<");
      out.push(
        cls ? (
          <span key={i} className={cls}>
            {txt}
          </span>
        ) : (
          <Fragment key={i}>{txt}</Fragment>
        ),
      );
    }
  });
  return <>{out}</>;
}
