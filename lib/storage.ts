import { getSupabase } from "./supabase";

const BUCKET = "fichas-imagens";
const MAX_SIDE = 1200; // px — boa qualidade para PDF, upload ~2x mais rápido
const QUALITY = 0.80;

function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(blob ?? file),
        "image/jpeg",
        QUALITY
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// O Storage do Supabase recusa chaves com acento ou caractere especial
// ("Invalid key") — ex. um nome de tabela como "CALÇA CÓS ... C/ ELASTANO".
// Normaliza cada segmento do caminho, preservando as barras que separam pastas.
function sanitizePath(path: string): string {
  const semAcento = (s: string) =>
    s.normalize("NFD")
      .split("")
      // descarta as marcas de acento combinantes (U+0300–U+036F)
      .filter(ch => { const c = ch.codePointAt(0) ?? 0; return c < 0x0300 || c > 0x036f; })
      .join("");

  return path
    .split("/")
    .map(seg =>
      semAcento(seg)
        .replace(/[^A-Za-z0-9._-]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
    )
    .filter(Boolean)
    .join("/");
}

export async function uploadImage(file: File, path: string): Promise<string | null> {
  const supabase = getSupabase();

  const compressed = await compressImage(file);
  const ext = "jpg";
  const filename = `${sanitizePath(path)}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, compressed, { upsert: true, contentType: "image/jpeg" });

  if (error) {
    console.error("Upload error:", error);
    return null;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

// Upload sem passar pelo canvas: PDF (e qualquer arquivo que não seja foto)
// tem de subir byte a byte. O uploadImage acima rasteriza tudo em JPEG — um
// PDF sairia de lá com a extensão .jpg e o conteúdo quebrado.
//
// Mantém a extensão e o tipo do original para o navegador abrir direto em vez
// de baixar como binário desconhecido.
export async function uploadArquivo(file: File, path: string): Promise<string | null> {
  const supabase = getSupabase();

  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const filename = `${sanitizePath(path)}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, file, { upsert: true, contentType: file.type || "application/octet-stream" });

  if (error) {
    console.error("uploadArquivo:", error);
    return null;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

export async function deleteImage(url: string): Promise<string | null> {
  const supabase = getSupabase();
  const parts = url.split(`${BUCKET}/`);
  if (parts.length < 2) return null;
  const path = parts[1];
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) { console.error("deleteImage:", error); return error.message || "Erro ao remover imagem"; }
  return null;
}

// Remove todos os arquivos de uma "pasta" (prefixo) do bucket — usado ao excluir
// um produto inteiro, para não deixar fotos órfãs acumulando no armazenamento.
export async function deleteImagesByPrefix(prefix: string): Promise<void> {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix);
  if (error) { console.error("deleteImagesByPrefix list:", error); return; }
  if (!data?.length) return;
  const paths = data.map(f => `${prefix}/${f.name}`);
  const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
  if (rmErr) console.error("deleteImagesByPrefix remove:", rmErr);
}

// Duplica todos os arquivos de uma referência (incluindo subpastas, como
// estamparia/arte_x/) para a pasta de outra. Usado ao clonar um produto: o
// clone ganha cópias próprias das imagens, então trocar ou apagar o desenho de
// um não quebra o do outro — nem excluir o original apaga as fotos do clone.
// Devolve o mapa URL antiga → URL nova, só dos arquivos que copiaram.
export async function copyImagesByPrefix(fromRef: string, toRef: string): Promise<Record<string, string>> {
  const supabase = getSupabase();
  const bucket = supabase.storage.from(BUCKET);
  const from = sanitizePath(fromRef), to = sanitizePath(toRef);
  const arquivos: string[] = [];
  const listar = async (pasta: string) => {
    const { data, error } = await bucket.list(pasta, { limit: 1000 });
    if (error) { console.error("copyImagesByPrefix list:", error); return; }
    for (const f of data || []) {
      // Pasta não tem id; arquivo tem.
      if (f.id) arquivos.push(`${pasta}/${f.name}`);
      else await listar(`${pasta}/${f.name}`);
    }
  };
  await listar(from);
  const mapa: Record<string, string> = {};
  await Promise.all(arquivos.map(async (orig) => {
    const destino = to + orig.slice(from.length);
    const { error } = await bucket.copy(orig, destino);
    if (error) { console.error("copyImagesByPrefix copy:", orig, error); return; }
    mapa[bucket.getPublicUrl(orig).data.publicUrl] = bucket.getPublicUrl(destino).data.publicUrl;
  }));
  return mapa;
}
