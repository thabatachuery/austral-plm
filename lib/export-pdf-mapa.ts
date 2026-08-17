import jsPDF from "jspdf";

interface ImgResult { data: string; w: number; h: number }

/** Load an image URL → base64 + natural dimensions via canvas. */
async function loadImg(url: string): Promise<ImgResult | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 10000);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      clearTimeout(timer);
      try {
        const nw = img.naturalWidth  || 400;
        const nh = img.naturalHeight || 400;
        const canvas = document.createElement("canvas");
        canvas.width  = nw;
        canvas.height = nh;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, nw, nh);
        ctx.drawImage(img, 0, 0);
        resolve({ data: canvas.toDataURL("image/jpeg", 0.92), w: nw, h: nh });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

/** Swatch da foto do tecido no canto inferior esquerdo da área de imagem. */
function addTecidoSwatch(doc: jsPDF, img: ImgResult, x: number, y: number, size: number) {
  const pad = 0.6;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x - pad, y - pad, size + pad * 2, size + pad * 2, 1.2, 1.2, "F");
  addImageContained(doc, img, x, y, size, size);
  doc.setDrawColor(190, 192, 205);
  doc.setLineWidth(0.2);
  doc.roundedRect(x - pad, y - pad, size + pad * 2, size + pad * 2, 1.2, 1.2, "S");
}

/** Return RGB for a status string (mirrors the online STATUS_COLORS logic). */
function statusRgb(status: string): [number, number, number] {
  const s = (status || "").toUpperCase();
  if (s.includes("CANCELADO"))              return [234, 47, 70];
  if (s.includes("PRODUÇÃO LIBERADA") || s.includes("PRODUCAO LIBERADA")) return [45, 181, 100];
  if (s.includes("PRODUÇÃO") || s.includes("PRODUCAO"))                   return [45, 181, 100];
  if (s.includes("MOSTRUÁRIO LIBERADO") || s.includes("MOSTRUARIO LIBERADO")) return [237, 202, 53];
  if (s.includes("MOSTRUÁRIO") || s.includes("MOSTRUARIO"))               return [237, 202, 53];
  if (s.includes("DESENVOLVIMENTO"))        return [68, 100, 175];
  return [170, 170, 170];
}

/** Draw an image contained (letterboxed) inside a box without stretching. */
function addImageContained(
  doc: jsPDF,
  img: ImgResult,
  boxX: number, boxY: number, boxW: number, boxH: number
) {
  const fmt = img.data.startsWith("data:image/png") ? "PNG" : "JPEG";
  const scale = Math.min(boxW / img.w, boxH / img.h);
  const dw = img.w * scale;
  const dh = img.h * scale;
  const dx = boxX + (boxW - dw) / 2;
  const dy = boxY + (boxH - dh) / 2;
  doc.addImage(img.data, fmt, dx, dy, dw, dh);
}

export async function exportMapaColecaoPDF(
  items: any[],
  filters: { colecao: string; fornecedor: string; grupo?: string; linha?: string; status?: string },
  imageMode: "desenho" | "foto",
  filename: string
): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape", format: "a4", unit: "mm" });
  const PW = doc.internal.pageSize.getWidth();   // 297 mm
  const PH = doc.internal.pageSize.getHeight();  // 210 mm
  const ML = 10;
  const MR = 10;
  const MT = 10;
  const MB = 10;
  const UW = PW - ML - MR;                       // 277 mm usable
  const date = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const imgUrlOf = (it: any) =>
    imageMode === "foto" ? (it.imagem_frente || it.imagem_modelo || it.imagem_url) : it.imagem_url;

  // Pre-load all images in parallel
  const imgDataMap: Record<string, ImgResult | null> = {};
  await Promise.all(
    items.filter(it => imgUrlOf(it)).map(async (it) => {
      imgDataMap[it.ref] = await loadImg(imgUrlOf(it));
    })
  );

  // Fotos de tecido — chaveadas pela URL, já que vários produtos repetem o
  // mesmo tecido e não vale baixar a mesma imagem várias vezes.
  const tecImgMap: Record<string, ImgResult | null> = {};
  await Promise.all(
    Array.from(new Set(items.map(it => it.tecido_imagem).filter(Boolean))).map(async (url: string) => {
      tecImgMap[url] = await loadImg(url);
    })
  );

  // Group items by grupo
  const groups: Record<string, any[]> = {};
  for (const it of items) {
    const g = it.grupo || "SEM GRUPO";
    if (!groups[g]) groups[g] = [];
    groups[g].push(it);
  }
  const sortedGroups = Object.keys(groups).sort();

  // Layout constants — 5 columns, taller image area
  const COLS    = 5;
  const GAP     = 2;                               // gap between cards
  const CARD_W  = (UW - GAP * (COLS - 1)) / COLS; // ≈ 51.4 mm
  const IMG_H   = 44;                              // image box height
  const INFO_H  = 28;                              // text area height
  const CARD_H  = IMG_H + INFO_H;
  const ROW_H   = CARD_H + GAP;

  let curY = MT;

  // ── Header ──────────────────────────────────────────────────────────────
  const drawPageHeader = (cont: boolean) => {
    doc.setFillColor(20, 20, 27);
    doc.rect(ML, curY, UW, 0.5, "F");
    curY += 4;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 27);
    const colLabel = filters.colecao || "TODAS";
    doc.text(`Mapa de Coleção — ${colLabel}${cont ? " (cont.)" : ""}`, ML, curY + 5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(110, 115, 130);
    doc.text(`Gerado em ${date}`, ML, curY + 10.5);

    const chips: string[] = [];
    if (filters.colecao)    chips.push(`Coleção: ${filters.colecao}`);
    if (filters.fornecedor) chips.push(`Fornecedor: ${filters.fornecedor}`);
    if (filters.grupo)      chips.push(`Grupo: ${filters.grupo}`);
    if (filters.linha)      chips.push(`Linha: ${filters.linha}`);
    if (filters.status)     chips.push(`Status: ${filters.status}`);
    if (chips.length > 0) {
      doc.setFontSize(7);
      doc.setTextColor(37, 99, 235);
      doc.text(chips.join("   ·   "), PW - MR, curY + 5, { align: "right" });
    }

    curY += 14;
  };

  // ── Footer ───────────────────────────────────────────────────────────────
  const drawFooter = (pageNum: number, total: number) => {
    doc.setPage(pageNum);
    doc.setDrawColor(220, 220, 225);
    doc.setLineWidth(0.2);
    doc.line(ML, PH - 7, PW - MR, PH - 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(160, 165, 175);
    doc.text("Austral PLM · Mapa de Coleção", ML, PH - 3.5);
    doc.text(`${pageNum} / ${total}`, PW - MR, PH - 3.5, { align: "right" });
  };

  // ── Page break guard ─────────────────────────────────────────────────────
  const checkNewPage = (neededH: number) => {
    if (curY + neededH > PH - MB - 8) {
      doc.addPage();
      curY = MT;
      drawPageHeader(true);
    }
  };

  drawPageHeader(false);

  // ── Groups & cards ───────────────────────────────────────────────────────
  for (const grupo of sortedGroups) {
    const groupItems = groups[grupo];

    checkNewPage(8 + ROW_H);

    // Group bar
    doc.setFillColor(30, 30, 38);
    doc.rect(ML, curY, UW, 6.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(
      `${grupo}  ·  ${groupItems.length} peça${groupItems.length !== 1 ? "s" : ""}`,
      ML + 4, curY + 4.4
    );
    curY += 8;

    for (let i = 0; i < groupItems.length; i++) {
      const col = i % COLS;
      if (col === 0 && i > 0) {
        curY += ROW_H;
        checkNewPage(ROW_H);
      }

      const item = groupItems[i];
      const cx   = ML + col * (CARD_W + GAP);
      const cy   = curY;
      const cw   = CARD_W;

      // Card background + border
      doc.setFillColor(252, 252, 254);
      doc.setDrawColor(215, 217, 226);
      doc.setLineWidth(0.22);
      doc.roundedRect(cx, cy, cw, CARD_H, 2, 2, "FD");

      // White image area background
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(cx + 0.5, cy + 0.5, cw - 1, IMG_H - 0.5, 2, 2, "F");

      // Image — contained (no stretch)
      const imgResult = imgUrlOf(item) ? imgDataMap[item.ref] : null;
      if (imgResult) {
        const pad = 2;
        addImageContained(doc, imgResult, cx + pad, cy + pad, cw - pad * 2, IMG_H - pad * 2);
      } else {
        doc.setFillColor(234, 235, 241);
        doc.setDrawColor(208, 210, 220);
        doc.roundedRect(cx + 1, cy + 1, cw - 2, IMG_H - 1, 2, 2, "FD");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(170, 174, 188);
        doc.text(item.ref, cx + cw / 2, cy + IMG_H / 2 + 1.5, { align: "center" });
      }

      // Foto do tecido — depois da imagem, para ficar por cima do desenho
      const tecImg = item.tecido_imagem ? tecImgMap[item.tecido_imagem] : null;
      if (tecImg) {
        const sw = 13;
        addTecidoSwatch(doc, tecImg, cx + 2.5, cy + IMG_H - sw - 2.5, sw);
      }

      // Status dot — drawn AFTER image so it's always on top
      const [sr, sg, sb2] = statusRgb(item.status);
      const dotR = 1.8;
      const dotX = cx + cw - dotR - 2.5;
      const dotY = cy + dotR + 2.5;
      doc.setFillColor(255, 255, 255);
      doc.circle(dotX, dotY, dotR + 0.7, "F");   // white halo
      doc.setFillColor(sr, sg, sb2);
      doc.circle(dotX, dotY, dotR, "F");

      // Divider
      doc.setDrawColor(215, 217, 226);
      doc.setLineWidth(0.18);
      doc.line(cx + 2, cy + IMG_H, cx + cw - 2, cy + IMG_H);

      // Info block
      const ix = cx + 2.5;
      const iw = cw - 5;
      let iy   = cy + IMG_H + 3.8;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(20, 22, 30);
      doc.text(item.ref, ix, iy, { maxWidth: iw });
      iy += 3.8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(40, 44, 55);
      const descLines = doc.splitTextToSize(item.desc || "", iw);
      doc.text(descLines.slice(0, 2), ix, iy);
      iy += descLines.slice(0, 2).length * 3.4;

      if (item.tecido) {
        doc.setFontSize(5.5);
        doc.setTextColor(110, 115, 130);
        const tecLine = item.composicao ? `${item.tecido}  ${item.composicao}` : item.tecido;
        doc.text(tecLine, ix, iy, { maxWidth: iw });
        iy += 3.2;
      }

      if (item.forn_tecido) {
        doc.setFontSize(5.5);
        doc.setTextColor(120, 124, 135);
        doc.text(item.forn_tecido, ix, iy, { maxWidth: iw });
        iy += 3.2;
      }

      if (item.fornecedor) {
        doc.setFontSize(5.5);
        doc.setTextColor(37, 99, 200);
        doc.text(`Forn: ${item.fornecedor}`, ix, iy, { maxWidth: iw });
        iy += 3.2;
      }

      if (item.colecao) {
        doc.setFontSize(5.5);
        doc.setTextColor(130, 134, 145);
        doc.text(`Coleção: ${item.colecao}`, ix, iy, { maxWidth: iw });
      }
    }

    // Advance after last row of this group
    curY += ROW_H + 4;
  }

  // Page numbers
  const total = (doc.internal as any).getNumberOfPages();
  for (let p = 1; p <= total; p++) drawFooter(p, total);

  doc.save(`${filename}.pdf`);
}
