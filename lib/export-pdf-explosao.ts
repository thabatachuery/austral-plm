import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function fmtCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Load an image URL → base64 via canvas (handles CORS from Supabase Storage). */
async function loadImg(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 10000);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || 400;
        canvas.height = img.naturalHeight || 400;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

export interface ExplosaoFilters {
  fornProd: string;
  status: string;
  colecao: string;
  fornAvi: string;
  /** Etapa que gerou os números (Desenvolvimento / Mostruário / Produção). */
  etapa?: string;
}

export async function exportExplosaoPDF(
  rows: any[],
  filters: ExplosaoFilters,
  filename: string
) {
  const doc = new jsPDF({ orientation: "landscape", format: "a4", unit: "mm" });
  const PW = doc.internal.pageSize.getWidth();   // 297mm
  const PH = doc.internal.pageSize.getHeight();  // 210mm
  const ML = 14;   // margin left/right
  const MB = 10;   // margin bottom
  const UW = PW - ML * 2; // usable width 269mm
  const date = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  // ── helper: draw page footer ──────────────────────────────────────────────
  const drawFooter = (pageNum: number, total: number) => {
    doc.setPage(pageNum);
    doc.setDrawColor(220, 220, 225);
    doc.setLineWidth(0.25);
    doc.line(ML, PH - MB, PW - ML, PH - MB);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(160, 165, 175);
    doc.text("Austral PLM · Explosão de Aviamentos", ML, PH - MB + 5);
    doc.text(`${pageNum} / ${total}`, PW - ML, PH - MB + 5, { align: "right" });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — DATA TABLE
  // ═══════════════════════════════════════════════════════════════════════════

  // Top accent bar
  doc.setFillColor(20, 20, 27);
  doc.rect(ML, 10, UW, 0.6, "F");

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(20, 20, 27);
  doc.text("Explosão de Aviamentos", ML, 22);

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 115, 130);
  doc.text(`Gerado em ${date}`, ML, 29);

  // Active filters chips
  const filterLabels: string[] = [];
  // A etapa vem primeiro: sem ela, duas exportações do mesmo filtro com
  // números diferentes ficam indistinguíveis no papel.
  if (filters.etapa)    filterLabels.push(`Etapa: ${filters.etapa}`);
  if (filters.fornProd) filterLabels.push(`Fornecedor: ${filters.fornProd}`);
  if (filters.status)   filterLabels.push(`Status: ${filters.status}`);
  if (filters.colecao)  filterLabels.push(`Coleção: ${filters.colecao}`);
  if (filters.fornAvi)  filterLabels.push(`Forn. Aviamento: ${filters.fornAvi}`);

  let tableStartY = 34;
  if (filterLabels.length > 0) {
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(191, 219, 254);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, 32, UW, 8, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(37, 99, 235);
    doc.text("Filtros:", ML + 3, 37.4);
    doc.setFont("helvetica", "normal");
    doc.text(filterLabels.join("   ·   "), ML + 17, 37.4);
    tableStartY = 44;
  }

  // Summary badge
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(110, 115, 130);
  doc.text(`${rows.length} item${rows.length !== 1 ? "s" : ""}`, PW - ML, 29, { align: "right" });

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: ML, right: ML },
    head: [[
      "#", "Código", "Cor", "Nome", "Cód. Forn.",
      "Forn. Aviamento", "Fornecedor", "Qtd", "Vlr. Unit.", "Vlr. Total", "Referências",
    ]],
    body: rows.map((r, i) => [
      i + 1,
      r.codigo ?? "",
      r.cor || "—",
      r.nome ?? "",
      r.codForn || "—",
      r.fornecedor || "—",
      r.fornProd || "—",
      r.qtd ?? 0,
      fmtCurrency(r.valorUnit ?? 0),
      fmtCurrency(r.valorTotal ?? 0),
      r.refs ?? "",
    ]),
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 2.8, bottom: 2.8, left: 2.5, right: 2.5 },
      overflow: "linebreak",
      lineColor: [225, 225, 230],
      lineWidth: 0.2,
      textColor: [30, 32, 40],
    },
    headStyles: {
      fillColor: [20, 20, 27],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
      cellPadding: { top: 3.5, bottom: 3.5, left: 2.5, right: 2.5 },
    },
    alternateRowStyles: { fillColor: [248, 248, 252] },
    columnStyles: {
      0:  { cellWidth: 7,  halign: "center", textColor: [150, 155, 165] },
      1:  { cellWidth: 21 },
      2:  { cellWidth: 15 },
      3:  { cellWidth: 46 },
      4:  { cellWidth: 21 },
      5:  { cellWidth: 36 },
      6:  { cellWidth: 31 },
      7:  { cellWidth: 13, halign: "right" },
      8:  { cellWidth: 22, halign: "right" },
      9:  { cellWidth: 23, halign: "right" },
      10: { cellWidth: 34 },
    },
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // IMAGE PAGES
  // ═══════════════════════════════════════════════════════════════════════════
  const withImages = rows.filter(r => r.imagem);

  if (withImages.length > 0) {
    // Load all images in parallel (with fallback null)
    const loaded = await Promise.all(
      withImages.map(async (r) => ({ ...r, imgData: await loadImg(r.imagem) }))
    );

    // Grid constants
    const COLS     = 4;
    const IMG_SIZE = 55;   // mm (square)
    const CELL_W   = Math.floor(UW / COLS);   // ≈ 67mm
    const LABEL_H  = 18;   // mm below image
    const CELL_H   = IMG_SIZE + LABEL_H;       // ≈ 73mm
    const ROW_GAP  = 5;    // mm between rows

    // Add first image page
    doc.addPage();
    let pageImgY = 10; // will be set after header

    const drawImgPageHeader = (cont: boolean) => {
      doc.setFillColor(20, 20, 27);
      doc.rect(ML, 10, UW, 0.6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(20, 20, 27);
      doc.text(`Imagens dos Aviamentos${cont ? " (cont.)" : ""}`, ML, 22);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(110, 115, 130);
      doc.text(`${loaded.length} item${loaded.length !== 1 ? "s" : ""} com imagem`, ML, 28);
      pageImgY = 34;
    };

    drawImgPageHeader(false);

    loaded.forEach((item, idx) => {
      const col = idx % COLS;

      // Start of a new row?
      if (col === 0 && idx > 0) {
        const nextY = pageImgY + CELL_H + ROW_GAP;
        if (nextY + CELL_H > PH - MB - 8) {
          // Need a new page
          doc.addPage();
          drawImgPageHeader(true);
        } else {
          pageImgY = nextY;
        }
      }

      const cellX = ML + col * CELL_W;
      const cellY = pageImgY;
      const imgX  = cellX + (CELL_W - IMG_SIZE) / 2;

      // Card background
      doc.setFillColor(248, 248, 252);
      doc.setDrawColor(220, 222, 230);
      doc.setLineWidth(0.25);
      doc.roundedRect(cellX + 1, cellY, CELL_W - 2, CELL_H + 2, 3, 3, "FD");

      // Image or placeholder
      if (item.imgData) {
        const fmt = item.imgData.startsWith("data:image/png") ? "PNG" : "JPEG";
        // Clip-style: just draw image, it'll be on top of card
        doc.addImage(item.imgData, fmt, imgX, cellY + 1, IMG_SIZE, IMG_SIZE);
      } else {
        // Placeholder box
        doc.setFillColor(236, 237, 242);
        doc.setDrawColor(210, 212, 220);
        doc.roundedRect(imgX, cellY + 1, IMG_SIZE, IMG_SIZE, 2, 2, "FD");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(175, 178, 190);
        doc.text("sem imagem", imgX + IMG_SIZE / 2, cellY + 1 + IMG_SIZE / 2, { align: "center" });
      }

      // Divider between image and labels
      doc.setDrawColor(220, 222, 230);
      doc.setLineWidth(0.2);
      doc.line(cellX + 3, cellY + IMG_SIZE + 2, cellX + CELL_W - 3, cellY + IMG_SIZE + 2);

      // Labels
      const lx = imgX;
      const lw = IMG_SIZE;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(20, 22, 30);
      const codeStr = item.cor ? `${item.codigo} · ${item.cor}` : item.codigo;
      doc.text(codeStr, lx, cellY + IMG_SIZE + 7, { maxWidth: lw });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(70, 75, 90);
      doc.text(item.nome ?? "", lx, cellY + IMG_SIZE + 12, { maxWidth: lw });

      if (item.codForn) {
        doc.setFontSize(7);
        doc.setTextColor(140, 143, 155);
        doc.text(`Cód: ${item.codForn}`, lx, cellY + IMG_SIZE + 17, { maxWidth: lw });
      }
    });
  }

  // ─── Page numbers (all pages) ────────────────────────────────────────────
  const total = (doc.internal as any).getNumberOfPages();
  for (let p = 1; p <= total; p++) drawFooter(p, total);

  doc.save(`${filename}.pdf`);
}
