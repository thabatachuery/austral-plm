import jsPDF from "jspdf";

interface ImgResult { data: string; w: number; h: number }

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
        canvas.width = nw; canvas.height = nh;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, nw, nh);
        ctx.drawImage(img, 0, 0);
        resolve({ data: canvas.toDataURL("image/jpeg", 0.92), w: nw, h: nh });
      } catch { resolve(null); }
    };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

function addImageContained(doc: jsPDF, img: ImgResult, bx: number, by: number, bw: number, bh: number) {
  const fmt = img.data.startsWith("data:image/png") ? "PNG" : "JPEG";
  const scale = Math.min(bw / img.w, bh / img.h);
  const dw = img.w * scale, dh = img.h * scale;
  doc.addImage(img.data, fmt, bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh);
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

function statusRgb(status: string): [number, number, number] {
  const s = (status || "").toUpperCase();
  if (s.includes("CANCELADO"))                                               return [234, 47, 70];
  if (s.includes("REPILOTANDO"))                                             return [245, 130, 10];
  if (s.includes("PRODUÇÃO LIBERADA") || s.includes("PRODUCAO LIBERADA"))   return [45, 181, 100];
  if (s.includes("PRODUÇÃO") || s.includes("PRODUCAO"))                     return [45, 181, 100];
  if (s.includes("MOSTRUÁRIO LIBERADO") || s.includes("MOSTRUARIO LIBERADO")) return [237, 202, 53];
  if (s.includes("MOSTRUÁRIO") || s.includes("MOSTRUARIO"))                 return [237, 202, 53];
  if (s.includes("DESENVOLVIMENTO"))                                         return [68, 100, 175];
  return [170, 170, 170];
}

function fmtDate(s: string): string {
  if (!s) return "";
  const d = new Date(s + "T12:00:00");
  if (isNaN(d.getTime())) return s;
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

const MONTHS_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MONTHS_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function parseDate(s: string) {
  const d = new Date(s + "T12:00:00");
  return isNaN(d.getTime()) ? null : d;
}
function monthKey(s: string) {
  const d = parseDate(s);
  return d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` : "9999-99";
}
function monthLabel(k: string) {
  const [y, m] = k.split("-").map(Number);
  return `${MONTHS_PT[m-1].toUpperCase()}  ${y}`;
}
function weekOfMonth(s: string) {
  const d = parseDate(s);
  return d ? Math.min(5, Math.ceil(d.getDate() / 7)) : 1;
}
function weekRangeLabel(mk: string, week: number) {
  const [y, m] = mk.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const start = (week - 1) * 7 + 1;
  const end   = Math.min(week * 7, daysInMonth);
  return `Semana ${week}  ·  ${String(start).padStart(2,"0")}–${String(end).padStart(2,"0")}/${MONTHS_SHORT[m-1]}`;
}

export async function exportMapaEntregasPDF(
  items: any[],
  filters: Record<string, string[]>,
  imageMode: "desenho" | "foto",
  filename = "mapa-entregas"
): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape", format: "a4", unit: "mm" });
  const PW = doc.internal.pageSize.getWidth();   // 297 mm
  const PH = doc.internal.pageSize.getHeight();  // 210 mm
  const ML = 10, MR = 10, MT = 10, MB = 10;
  const UW = PW - ML - MR;
  const date = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const imgUrlOf = (it: any) => imageMode === "foto" ? (it.imagem_frente || it.imagem_modelo || it.imagem_url) : it.imagem_url;

  // Pre-load images
  const imgDataMap: Record<string, ImgResult | null> = {};
  await Promise.all(
    items.filter(it => imgUrlOf(it)).map(async (it) => {
      const key = `${it.ref}_${it.data_entrega}`;
      if (!imgDataMap[key]) imgDataMap[key] = await loadImg(imgUrlOf(it));
    })
  );

  // Fotos de tecido — chaveadas pela URL (o mesmo tecido repete em vários cards)
  const tecImgMap: Record<string, ImgResult | null> = {};
  await Promise.all(
    Array.from(new Set(items.map(it => it.tecido_imagem).filter(Boolean))).map(async (url: string) => {
      tecImgMap[url] = await loadImg(url);
    })
  );

  // Group: month → week → entries
  const mMap = new Map<string, Map<number, any[]>>();
  for (const it of items) {
    const mk = monthKey(it.data_entrega);
    const wk = weekOfMonth(it.data_entrega);
    if (!mMap.has(mk)) mMap.set(mk, new Map());
    const wMap = mMap.get(mk)!;
    if (!wMap.has(wk)) wMap.set(wk, []);
    wMap.get(wk)!.push(it);
  }
  const months = Array.from(mMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mk, wMap]) => ({
      key: mk, label: monthLabel(mk),
      weeks: Array.from(wMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([wk, entries]) => ({ label: weekRangeLabel(mk, wk), entries })),
    }));

  // Layout
  const COLS   = 5;
  const GAP    = 2;
  const CARD_W = (UW - GAP * (COLS - 1)) / COLS;
  const IMG_H  = 32;
  const INFO_H = 36;
  const CARD_H = IMG_H + INFO_H;
  const ROW_H  = CARD_H + GAP;

  let curY = MT;
  let pageNum = 1;

  const drawPageHeader = (cont: boolean) => {
    doc.setFillColor(20, 20, 27);
    doc.rect(ML, curY, UW, 0.5, "F");
    curY += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 27);
    doc.text(`Mapa de Entregas${cont ? " (cont.)" : ""}`, ML, curY + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(110, 115, 130);
    doc.text(`Gerado em ${date}`, ML, curY + 10.5);
    const activeFilters = Object.entries(filters)
      .filter(([, v]) => v.length > 0)
      .map(([k, v]) => `${k}: ${v.join(", ")}`);
    if (activeFilters.length > 0) {
      doc.setFontSize(7);
      doc.setTextColor(37, 99, 235);
      doc.text(activeFilters.join("   ·   "), PW - MR, curY + 5, { align: "right" });
    }
    curY += 14;
  };

  const drawFooter = (pNum: number, total: number) => {
    doc.setPage(pNum);
    doc.setDrawColor(220, 220, 225);
    doc.setLineWidth(0.2);
    doc.line(ML, PH - 7, PW - MR, PH - 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(160, 165, 175);
    doc.text("Austral PLM · Mapa de Entregas", ML, PH - 3.5);
    doc.text(`${pNum} / ${total}`, PW - MR, PH - 3.5, { align: "right" });
  };

  const checkNewPage = (neededH: number) => {
    if (curY + neededH > PH - MB - 8) {
      doc.addPage();
      pageNum++;
      curY = MT;
      drawPageHeader(true);
    }
  };

  drawPageHeader(false);

  for (const month of months) {
    // Month header
    checkNewPage(8 + 6 + ROW_H);
    doc.setFillColor(19, 19, 31);
    doc.roundedRect(ML, curY, UW, 7, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(month.label, ML + 5, curY + 4.8);
    curY += 9;

    for (const week of month.weeks) {
      checkNewPage(6 + ROW_H);

      // Week sub-header
      doc.setFillColor(240, 242, 250);
      doc.setDrawColor(68, 100, 175);
      doc.setLineWidth(0.8);
      doc.line(ML, curY, ML, curY + 5.5);
      doc.setFillColor(240, 242, 250);
      doc.rect(ML + 1, curY, UW - 1, 5.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(68, 100, 175);
      doc.text(week.label, ML + 4, curY + 3.8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(130, 134, 145);
      doc.text(`${week.entries.length} produto${week.entries.length !== 1 ? "s" : ""}`, PW - MR, curY + 3.8, { align: "right" });
      curY += 7.5;

      for (let i = 0; i < week.entries.length; i++) {
        const col = i % COLS;
        if (col === 0 && i > 0) {
          curY += ROW_H;
          checkNewPage(ROW_H);
        }
        const item = week.entries[i];
        const cx = ML + col * (CARD_W + GAP);
        const cy = curY;
        const cw = CARD_W;
        const [sr, sg, sb2] = statusRgb(item.status);

        // Card border (top = status color)
        doc.setFillColor(252, 252, 254);
        doc.setDrawColor(215, 217, 226);
        doc.setLineWidth(0.22);
        doc.roundedRect(cx, cy, cw, CARD_H, 2, 2, "FD");

        // Status top bar
        doc.setFillColor(sr, sg, sb2);
        doc.roundedRect(cx, cy, cw, 1.5, 1, 1, "F");
        doc.rect(cx, cy + 0.8, cw, 0.7, "F");

        // White image bg
        doc.setFillColor(255, 255, 255);
        doc.rect(cx + 0.5, cy + 1.5, cw - 1, IMG_H - 1, "F");

        // Image
        const imgKey = `${item.ref}_${item.data_entrega}`;
        const imgResult = imgUrlOf(item) ? imgDataMap[imgKey] : null;
        if (imgResult) {
          addImageContained(doc, imgResult, cx + 1.5, cy + 2, cw - 3, IMG_H - 3);
        } else {
          doc.setFillColor(234, 235, 241);
          doc.rect(cx + 1, cy + 1.5, cw - 2, IMG_H - 1.5, "F");
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6);
          doc.setTextColor(170, 174, 188);
          doc.text(item.ref, cx + cw / 2, cy + IMG_H / 2 + 2, { align: "center" });
        }

        // Foto do tecido — por cima do desenho, no canto de baixo
        const tecImg = item.tecido_imagem ? tecImgMap[item.tecido_imagem] : null;
        if (tecImg) {
          const sw = 7.5;
          addTecidoSwatch(doc, tecImg, cx + 2, cy + IMG_H - sw - 2, sw);
        }

        // Divider
        doc.setDrawColor(215, 217, 226);
        doc.setLineWidth(0.18);
        doc.line(cx + 2, cy + IMG_H, cx + cw - 2, cy + IMG_H);

        // Info
        const ix = cx + 2.5;
        const iw = cw - 5;
        let iy = cy + IMG_H + 3.5;

        // Ref
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(20, 22, 30);
        doc.text(item.ref, ix, iy, { maxWidth: iw });
        iy += 3.8;

        // Desc
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.5);
        doc.setTextColor(40, 44, 55);
        const descLines = doc.splitTextToSize(item.desc || "", iw);
        doc.text(descLines.slice(0, 2), ix, iy);
        iy += Math.min(2, descLines.length) * 3.2;

        // Tecido
        if (item.tecido) {
          doc.setFontSize(5);
          doc.setTextColor(110, 115, 130);
          doc.text(item.composicao ? `${item.tecido}  ${item.composicao}` : item.tecido, ix, iy, { maxWidth: iw });
          iy += 3;
        }

        // Entrega date
        doc.setFontSize(5);
        doc.setTextColor(sr, sg, sb2);
        doc.setFont("helvetica", "bold");
        doc.text(`Entrega: ${fmtDate(item.data_entrega)}`, ix, iy, { maxWidth: iw });
        iy += 3.2;
        doc.setFont("helvetica", "normal");

        // Variants
        const maxVars = 4;
        const vars = item.variantes.slice(0, maxVars);
        for (const v of vars) {
          doc.setFontSize(4.8);
          doc.setTextColor(60, 64, 80);
          const pedStr = v.pedido ? `  Ped.${v.pedido}` : "";
          doc.text(`• ${v.cor}  —  ${v.qtd} un.${pedStr}`, ix, iy, { maxWidth: iw });
          iy += 2.8;
        }
        if (item.variantes.length > maxVars) {
          doc.setFontSize(4.5);
          doc.setTextColor(150, 154, 165);
          doc.text(`+ ${item.variantes.length - maxVars} cor${item.variantes.length - maxVars !== 1 ? "es" : ""} ...`, ix, iy);
        }
      }

      curY += ROW_H + 4;
    }

    curY += 4;
  }

  const total = (doc.internal as any).getNumberOfPages();
  for (let p = 1; p <= total; p++) drawFooter(p, total);

  doc.save(`${filename}.pdf`);
}
