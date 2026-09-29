// Transforma as páginas de um PDF em imagens (JPEG em data URL), para anexar
// a ficha técnica do tecido no final da ficha do produto. A ficha é impressa
// pelo window.print() — um PDF embutido num <iframe> não sai na impressão,
// mas uma <img> sai em qualquer navegador, inclusive no Safari do iPhone.
//
// pdfjs-dist fica na 3.x (build legacy): a 4.x usa Promise.withResolvers, que
// o Safari de iOS anterior ao 17.4 não tem. O worker é servido de /public e
// tem que ser da mesma versão do pacote.

// 2x a escala do PDF (72 dpi) ≈ 144 dpi numa folha A4: nítido no papel sem
// estourar a memória do iPhone com fichas de várias páginas.
const ESCALA = 2;

export async function pdfEmImagens(url: string): Promise<string[]> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

  const doc = await pdfjs.getDocument({ url }).promise;
  const paginas: string[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const viewport = pagina.getViewport({ scale: ESCALA });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d")!;
      // Fundo branco: sem ele o JPEG pinta de preto o que é transparente.
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pagina.render({ canvasContext: ctx, viewport }).promise;
      paginas.push(canvas.toDataURL("image/jpeg", 0.9));
      pagina.cleanup();
    }
  } finally {
    doc.destroy();
  }
  return paginas;
}
