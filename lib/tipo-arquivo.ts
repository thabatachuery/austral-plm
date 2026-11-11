// Tipo de arquivo dos envios pela extensão — ícone e se é vídeo (que abre para
// assistir em vez de baixar). Qualquer extensão é aceita no envio; o que não
// está aqui sai com o ícone genérico.

const EXT = (nome: string) => (nome.split(".").pop() || "").toLowerCase();

export const ehVideo = (nome: string) => /^(mp4|mov|m4v|webm|avi|mkv)$/.test(EXT(nome));

export function iconeArquivo(nome: string): string {
  const e = EXT(nome);
  if (ehVideo(nome)) return "🎬";
  if (e === "pdf") return "📄";
  if (/^(ai|eps|svg|psd|psb|indd|cdr|fig|sketch)$/.test(e)) return "🎨";
  if (/^(jpe?g|png|gif|webp|tiff?|bmp|heic|avif)$/.test(e)) return "🖼️";
  if (/^(zip|rar|7z|gz|tar)$/.test(e)) return "🗜️";
  if (/^(xlsx?|csv|ods)$/.test(e)) return "📊";
  if (/^(docx?|odt|txt|rtf)$/.test(e)) return "📝";
  return "📎";
}
