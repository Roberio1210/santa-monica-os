import { Fragment } from "react";

/**
 * Títulos como "Alagamento/Inundação" não têm espaço para quebrar e, num card de ~140px de texto
 * (grade de 2 colunas em 390px), estourariam a largura. Um `<wbr>` depois de cada "/" permite a
 * quebra exatamente ali, sem cortar palavras.
 */
export function BreakableText({ text }: { text: string }) {
  const parts = text.split("/");
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part}
          {index < parts.length - 1 ? (
            <>
              /<wbr />
            </>
          ) : null}
        </Fragment>
      ))}
    </>
  );
}
