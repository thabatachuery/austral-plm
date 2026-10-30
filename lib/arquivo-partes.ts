// O Storage do Supabase recusa qualquer objeto acima de 50 MB ("Payload too
// large") — limite do projeto, não do bucket. PDF de lote e vídeo de prova
// passam disso, então o envio grava o arquivo em pedaços ("….pdf.part0",
// ".part1"…) e quem baixa junta de volta no navegador.
//
// Não há coluna para o número de partes: ele sai do tamanho, que já é gravado
// em envio_arquivos. A URL guardada é a da parte 0.

export const PARTE_BYTES = 45 * 1048576;

const SUFIXO = /\.part0$/;

export const ehPartido = (url: string) => SUFIXO.test(url);

export function urlsDasPartes(url: string, tamanho: number): string[] {
  if (!ehPartido(url)) return [url];
  const n = Math.max(1, Math.ceil(tamanho / PARTE_BYTES));
  return Array.from({ length: n }, (_, i) => url.replace(SUFIXO, `.part${i}`));
}
