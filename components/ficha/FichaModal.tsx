"use client";
import { useState, useRef, useEffect } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";
import { uploadImage, deleteImage } from "@/lib/storage";
import { fetchFicha, fetchFichasColecoes, reorderFichaColecoes, deleteFichaColecao, upsertFicha, saveFichaImagem, imagemUsadaEmOutraFicha, updateProdutoField, fetchPontosByTabelaNome, fetchGraduacoesByTabelaNome, fetchCadastros, fetchAviamentos, fetchTecidos, fetchVarianteCompras, fetchTabelasMedidas, criarAlerta } from "@/lib/db";
import { classificarNCM } from "@/lib/ncm";
import { calcularPesoPeca, type ResultadoPeso } from "@/lib/peso";
import { fotosParaExibir } from "@/lib/aviamento-fotos";
import { aviamentosAutomaticos, custoAviamentosPorPeca } from "@/lib/etiquetas-tamanho";
import { COR_PALETTE } from "@/lib/cor-palette";
import { useAuth } from "@/lib/auth-context";
import { nomeUsuario } from "@/lib/utils";
import { STATUS_ESTILO } from "@/lib/constants";
import { tamanhosParaExibir, valorNoTamanho, calcularDaBase, num as tamNum } from "@/lib/tamanhos";
import FichaPDF from "./FichaPDF";

// Status em que qualquer alteração de cor/tecido/aviamento dispara o popup de alerta.
const STATUS_ALERTA = [STATUS_ESTILO.MOSTARIO_LIBERADO, STATUS_ESTILO.PRODUCAO_LIBERADA, STATUS_ESTILO.REPILOTANDO_PRODUCAO] as string[];

type Props = { row: any; onClose: () => void; onSave: (r: any, variantesChanged?: boolean) => void };

export default function FichaModal({ row, onClose, onSave }: Props) {
  const [tab, setTab] = useState<"ficha" | "estamparia" | "liberacao" | "graduacao">("ficha");
  const [img, setImg] = useState<string | null>(null);
  const [imgModelo, setImgModelo] = useState<string | null>(null);
  const [imgModoMedir, setImgModoMedir] = useState<string | null>(null);
  const [imgFrente, setImgFrente] = useState<string | null>(null);
  const [imgCostas, setImgCostas] = useState<string | null>(null);
  const [up, setUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fichaId, setFichaId] = useState<number | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [showExportDlg, setShowExportDlg] = useState(false);
  const [exportSections, setExportSections] = useState<{ ficha: boolean; estamparia: boolean; liberacao: boolean; graduacao: boolean }>({ ficha: true, estamparia: true, liberacao: true, graduacao: true });
  const fr = useRef<HTMLInputElement>(null);
  const mrr = useRef<HTMLInputElement>(null);
  const frenteRef = useRef<HTMLInputElement>(null);
  const costasRef = useRef<HTMLInputElement>(null);
  const estImgRef = useRef<HTMLInputElement>(null);
  const [estImgTarget, setEstImgTarget] = useState<{ type: string; key: string } | null>(null);

  const [tec, setTec] = useState<any[]>([]);
  const DEFAULT_AVI = [{ item: "ADESIVO DE CÓDIGO DE BARRAS", cod: "AD0001", qtd: 1, valor: 0.10, local: "COLADO NO VERSO DO TAG", var01: "", var02: "", var03: "", var04: "", var05: "", var06: "" }];
  const [avi, setAvi] = useState<any[]>(DEFAULT_AVI);
  const [pil, setPil] = useState<any[]>([{ num: "Piloto 1", lacre: "", envio: "", receb: "", prova: "", status: "" }, { num: "Piloto 2", lacre: "", envio: "", receb: "", prova: "", status: "" }, { num: "Piloto 3", lacre: "", envio: "", receb: "", prova: "", status: "" }]);
  const [obs, setObs] = useState("");
  const [sap, setSap] = useState(false);
  const [asq, setAsq] = useState("");
  const [corOpts, setCorOpts] = useState<string[]>([]);
  const [avCad, setAvCad] = useState<any[]>([]);
  const [tecCad, setTecCad] = useState<any[]>([]);
  const [estamparia, setEstamparia] = useState<any>({ artes: [{ posicao: "FRENTE", imagem: "", largura: "", localizacao: "" }, { posicao: "COSTAS", imagem: "", largura: "", localizacao: "" }, { posicao: "TAGLESS", imagem: "", largura: "", localizacao: "" }], tecnicas: [], simulacoes: { var01: { nome: "", imgSim: "", imgFoto: "", status: "" }, var02: { nome: "", imgSim: "", imgFoto: "", status: "" }, var03: { nome: "", imgSim: "", imgFoto: "", status: "" }, var04: { nome: "", imgSim: "", imgFoto: "", status: "" } }, observacoes: "" });
  const [varCodigos, setVarCodigos] = useState<{ var01: string; var02: string; var03: string; var04: string; var05: string; var06: string }>({ var01: "", var02: "", var03: "", var04: "", var05: "", var06: "" });
  const [varTingimento, setVarTingimento] = useState<{ var01: string; var02: string; var03: string; var04: string; var05: string; var06: string }>({ var01: "", var02: "", var03: "", var04: "", var05: "", var06: "" });
  const [qtdMost, setQtdMost] = useState<{ var01: number|null; var02: number|null; var03: number|null; var04: number|null; var05: number|null; var06: number|null }>({ var01: null, var02: null, var03: null, var04: null, var05: null, var06: null });
  // Compras por variante (key = `${row.id}:${cor}`) — somente leitura aqui, fonte é Compras > Variantes
  const [vcCompras, setVcCompras] = useState<Record<string, any>>({});
  const [tingimentoOpts, setTingimentoOpts] = useState<string[]>([]);
  const [statusLib, setStatusLib] = useState("");
  const [numVars, setNumVars] = useState(4);
  const [pendingSave, setPendingSave] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const autoSaveTimer = useRef<any>(null);
  const isLoaded = useRef(false);
  const saveRef = useRef<(confirmed?: boolean) => Promise<void>>();
  const lastCoresRef = useRef<string>("");
  const baselineRef = useRef<{ tec: any[]; avi: any[] }>({ tec: [], avi: [] });
  const { confirm, Dialog: ConfirmDialog } = useConfirm();
  const { user } = useAuth();

  const [pts, setPts] = useState<any[]>([]);
  const [grad, setGrad] = useState<any[]>([]);
  // Esquema de tamanhos da tabela de medidas do produto
  const [tabTamanhos, setTabTamanhos] = useState<string[]>([]);
  const [tabBase, setTabBase] = useState("");
  // Texto em digitação das datas de prova. O valor final é guardado em ISO
  // (provaInfo[].data), mas enquanto a data está incompleta ela não converte —
  // sem este rascunho o campo se apagaria a cada tecla.
  const [dataProvaDraft, setDataProvaDraft] = useState<Record<string, string>>({});
  const [pv, setPv] = useState<Record<string, { p1: string; p2: string; p3: string }>>({});
  const [an, setAn] = useState<Record<string, { texto: string; video: string }>>({ p1: { texto: "", video: "" }, p2: { texto: "", video: "" }, p3: { texto: "", video: "" } });
  const [provaInfo, setProvaInfo] = useState<Record<string, { data: string; status: string; link: string; fotoFrente: string; fotoLado: string; fotoCostas: string; tipo: string }>>({ p1: { data: "", status: "", link: "", fotoFrente: "", fotoLado: "", fotoCostas: "", tipo: "" }, p2: { data: "", status: "", link: "", fotoFrente: "", fotoLado: "", fotoCostas: "", tipo: "" }, p3: { data: "", status: "", link: "", fotoFrente: "", fotoLado: "", fotoCostas: "", tipo: "" } });
  const [custoDet, setCustoDet] = useState({ mp: "", mo: "" });
  const [obsCusto, setObsCusto] = useState("");
  const fotoProvaRef = useRef<HTMLInputElement>(null);
  const [fotoProvaTarget, setFotoProvaTarget] = useState<{ prova: "p1"|"p2"|"p3"; side: "frente"|"lado"|"costas" } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  /* Peso médio da peça — calculado a partir do tecido + área da modelagem */
  const [areaMedia, setAreaMedia] = useState<number | null>(null);
  const [peso, setPeso] = useState<ResultadoPeso | null>(null);

  /* NCM */
  const [ncm, setNcm] = useState("");
  const [ncmJust, setNcmJust] = useState("");
  const [ncmLoading, setNcmLoading] = useState(false);

  /* Tabela especial (por produto) */
  const [tEsp, setTEsp] = useState(false);
  const [ptsEsp, setPtsEsp] = useState<any[]>([]);
  const [gradEsp, setGradEsp] = useState<any[]>([]);

  /* Clássicos: seleção de temporada */
  const isClassic = (row.ref || "").startsWith("11") || /cl.ssic/i.test(row.colecao || "");
  const [selectedColecao, setSelectedColecao] = useState<string | null>(null);
  const [colecaoOpts, setColecaoOpts] = useState<string[]>([]);
  const [newColecaoMode, setNewColecaoMode] = useState(false);
  const [colecaoCadOpts, setColecaoCadOpts] = useState<string[]>([]);
  const [editandoTemporadas, setEditandoTemporadas] = useState(false);
  const draggedTemporadaRef = useRef<string | null>(null);
  const seedTemporadaRef = useRef<any>(null);

  /* Carrega temporadas disponíveis e opções de cadastro para refs clássicas */
  useEffect(() => {
    if (!isClassic) return;
    Promise.all([fetchFichasColecoes(row.ref), fetchCadastros()]).then(([opts, cad]) => {
      setColecaoOpts(opts);
      setColecaoCadOpts(cad.colecao || []);
      if (opts.length > 0 && selectedColecao === null) setSelectedColecao(opts[0]);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.ref, isClassic]);

  const moverTemporada = (destino: string) => {
    const origem = draggedTemporadaRef.current;
    draggedTemporadaRef.current = null;
    if (!origem || origem === destino) return;
    setColecaoOpts(prev => {
      const semOrigem = prev.filter(c => c !== origem);
      const idx = semOrigem.indexOf(destino);
      const nova = [...semOrigem.slice(0, idx), origem, ...semOrigem.slice(idx)];
      reorderFichaColecoes(row.ref, nova);
      return nova;
    });
  };

  const excluirTemporada = async (colecao: string) => {
    if (colecaoOpts.length <= 1) return;
    const confirmed = await confirm({
      title: "Excluir temporada?",
      message: `Isso apaga tecidos, aviamentos, fotos e provas da temporada "${colecao}". Não pode ser desfeito.`,
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      variant: "danger",
    });
    if (!confirmed) return;
    const err = await deleteFichaColecao(row.ref, colecao);
    if (err) return;
    const restantes = colecaoOpts.filter(c => c !== colecao);
    setColecaoOpts(restantes);
    if (selectedColecao === colecao) setSelectedColecao(restantes[0] || null);
  };

  /* Temporada nova de um clássico nasce com os dados da temporada que estava
     aberta — menos o que é por variante (cores dos tecidos, pantones,
     tingimento, cor do aviamento, simulações de estampa e qtd de mostruário),
     que é justamente o que muda de uma temporada pra outra. O seed entra no
     lugar da ficha no carregamento abaixo e o auto-save grava como ficha nova,
     sem tocar na temporada de origem (o fichaId é zerado na troca). */
  const adicionarTemporada = (nova: string) => {
    // fichaId só existe quando há uma ficha salva na tela pra servir de origem.
    if (fichaId && isDataLoaded) {
      seedTemporadaRef.current = {
        id: null,
        tecidos: tec.map((t: any) => ({ ...t, cores: [] })),
        aviamentos: avi.map((a: any) => ({ ...a, var01: "", var02: "", var03: "", var04: "", var05: "", var06: "" })),
        pilotagem: pil, provas: pv, anotacoes: an, provaInfo, statusLiberacao: statusLib,
        observacoes: obs, ncm, custoDet, obsCusto, pesoCalculo: peso,
        imagem_url: img, imagem_modelo: imgModelo, imagem_modo_medir: imgModoMedir,
        imagem_frente: imgFrente, imagem_costas: imgCostas,
        estamparia: { ...estamparia, numVariantes: numVars, simulacoes: {} },
        pantones: {}, tingimento: null,
        qtdMost: { var01: null, var02: null, var03: null, var04: null, var05: null, var06: null },
        tabelaEspecialAtiva: tEsp, pontosEspeciais: ptsEsp, gradEspecial: gradEsp,
      };
      // O tingimento é reaplicado por merge no carregamento, então um valor nulo
      // no seed não limparia nada — zera aqui pra não vazar da temporada anterior.
      setVarTingimento({ var01: "", var02: "", var03: "", var04: "", var05: "", var06: "" });
    }
    setColecaoOpts(prev => prev.includes(nova) ? prev : [...prev, nova]);
    setSelectedColecao(nova);
    setNewColecaoMode(false);
  };

  useEffect(() => {
    (async () => {
      // Para clássicos: carrega a ficha da temporada selecionada (ou null se nenhuma ainda)
      const fichaColecao = isClassic ? selectedColecao : null;
      setFichaId(null);
      const [fichaSalva, cadastros, aviCad, tecs, vcAll, tabs] = await Promise.all([fetchFicha(row.ref, fichaColecao), fetchCadastros(), fetchAviamentos(), fetchTecidos(), fetchVarianteCompras(), fetchTabelasMedidas()]);
      // Temporada recém-adicionada ainda não tem ficha salva: usa a cópia da
      // temporada anterior montada em adicionarTemporada.
      const seed = seedTemporadaRef.current;
      seedTemporadaRef.current = null;
      const ficha = fichaSalva || seed;
      setVcCompras(vcAll);
      setCorOpts(cadastros.cor || []);
      setTingimentoOpts(cadastros.tingimento || []);
      setAvCad(aviCad);
      setTecCad(tecs);
      const mkAvi = (cod: string) => { const c = aviCad.find((x: any) => x.cod === cod); return c ? { item: c.nome, cod: c.cod, qtd: 1, valor: c.preco, local: c.localizacao_padrao || "", var01: "", var02: "", var03: "", var04: "", var05: "", var06: "" } : null; };
      const aviBase = (() => {
        // Aviamentos automáticos: tag da linha + etiquetas de tamanho da grade×linha
        // (comparação normalizada — "PP AO GG"/"PP - GG"/"PP-GG" equivalem). Regras
        // em lib/etiquetas-tamanho. Cada código faltante é adicionado individualmente.
        const autoCodes: string[] = aviamentosAutomaticos(row.grade, row.linha);
        let base: any[] = ficha?.aviamentos?.length ? [...ficha.aviamentos] : [];
        if (!base.some((a: any) => a.cod === "AD0001"))
          base = [mkAvi("AD0001") || DEFAULT_AVI[0], ...base];
        const faltantes = autoCodes.filter(cod => !base.some((a: any) => a.cod === cod));
        if (faltantes.length)
          base = [...base, ...faltantes.map(mkAvi).filter(Boolean)];
        return base.length ? base : [mkAvi("AD0001") || DEFAULT_AVI[0]];
      })();
      const aviComputed = aviBase.map((a: any) => {
        const cat = aviCad.find((c: any) => c.cod === a.cod);
        const cores = cat?.cores_disponiveis || [];
        const autoColor = cores.length === 1 ? cores[0] : "";
        const varPatch: Record<string, string> = {};
        if (autoColor) (["var01","var02","var03","var04","var05","var06"] as const).forEach(k => { if (!a[k]) varPatch[k] = autoColor; });
        return { ...a, ...varPatch, imagem: cat?.imagem || "", imagens_cores: cat?.imagens_cores || {}, cores_disponiveis: cores, fornecedor: cat?.fornecedor || "", codigo_fornecedor: cat?.codigo_fornecedor || "" };
      });
      setAvi(aviComputed);
      let tecComputed: any[] = [];
      // Carrega imagem do modo de medir e a área média da tabela de medidas
      if (row.tab_medidas && tabs) {
        const t = tabs.find((t: any) => t.nome === row.tab_medidas);
        setAreaMedia((t as any)?.area_media ?? null);
        if (t && (t as any).imagem_modo_medir) setImgModoMedir((t as any).imagem_modo_medir);
      }
      if (ficha) {
        setFichaId(ficha.id); setImg(ficha.imagem_url); setImgModelo(ficha.imagem_modelo);
        setImgFrente(ficha.imagem_frente || null); setImgCostas(ficha.imagem_costas || null);
        const ficTec = ficha.tecidos || [];
        if (ficTec.length > 0) {
          // Se o primeiro tecido da ficha está vazio mas o produto tem tecido, preenche
          const first = ficTec[0];
          if ((!first.artigo || first.artigo === "") && row.tecido) {
            ficTec[0] = { ...first, artigo: row.tecido, forn: row.forn_tecido || "" };
          }
          tecComputed = ficTec;
        } else {
          tecComputed = row.tecido ? [{ artigo: row.tecido, forn: row.forn_tecido || "", preco: 0, cores: ["", "", "", ""] }] : [];
        }
        setTec(tecComputed);
        if (ficha.pilotagem?.length) setPil(ficha.pilotagem);
        setObs(ficha.observacoes || "");
        if (ficha.provas) setPv(ficha.provas);
        if (ficha.anotacoes) setAn(prev => ({ ...prev, ...ficha.anotacoes }));
        if (ficha.estamparia) { setEstamparia(ficha.estamparia); if (ficha.estamparia.numVariantes) setNumVars(Math.max(4, ficha.estamparia.numVariantes)); }
        if (ficha.pantones) setVarCodigos({ var01: ficha.pantones.var01 || "", var02: ficha.pantones.var02 || "", var03: ficha.pantones.var03 || "", var04: ficha.pantones.var04 || "", var05: ficha.pantones.var05 || "", var06: ficha.pantones.var06 || "" });
        if (ficha.tingimento) setVarTingimento(prev => ({ ...prev, ...ficha.tingimento }));
        if (ficha.qtdMost) setQtdMost(prev => ({ ...prev, ...ficha.qtdMost }));
        if (ficha.statusLiberacao) setStatusLib(ficha.statusLiberacao);
        if (ficha.provaInfo) {
          const migrated = Object.fromEntries(Object.entries(ficha.provaInfo).map(([k, v]: [string, any]) => [k, { data: v.data || "", status: v.status || "", link: v.link || "", fotoFrente: v.fotoFrente || v.foto || "", fotoLado: v.fotoLado || "", fotoCostas: v.fotoCostas || "", tipo: v.tipo || "" }]));
          setProvaInfo(prev => ({ ...prev, ...migrated }));
        }
        if (ficha.custoDet) setCustoDet(ficha.custoDet);
        if (ficha.obsCusto) setObsCusto(ficha.obsCusto);
        if (ficha.pesoCalculo) setPeso(ficha.pesoCalculo);
        if (ficha.ncm) setNcm(ficha.ncm);
        if (ficha.tabelaEspecialAtiva) { setTEsp(true); setPtsEsp(ficha.pontosEspeciais || []); setGradEsp(ficha.gradEspecial || []); }
      }
      /* Se não há ficha, cria linha inicial de tecido */
      if (!ficha) {
        tecComputed = [{ artigo: row.tecido || "", forn: row.forn_tecido || "", preco: 0, cores: ["", "", "", ""] }];
        setTec(tecComputed);
      }
      baselineRef.current = { tec: tecComputed, avi: aviComputed };
      if (row.tab_medidas) {
        const [p, g] = await Promise.all([
          fetchPontosByTabelaNome(row.tab_medidas),
          fetchGraduacoesByTabelaNome(row.tab_medidas),
        ]);
        setPts(p);
        setGrad(g.linhas);
        setTabTamanhos(g.tamanhos);
        setTabBase(g.base);
        if (!ficha?.provas) { const init: any = {}; p.forEach((pt: any) => { init[pt.cod] = { p1: "", p2: "", p3: "" }; }); setPv(init); }
      }
      setIsDataLoaded(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.ref, row.tab_medidas, selectedColecao, isClassic]);

  // Só apaga o arquivo se nenhuma outra temporada do clássico ainda usar ele.
  const apagarImagem = async (url: string) => {
    if (await imagemUsadaEmOutraFicha(row.ref, fichaId, url)) return;
    await deleteImage(url);
  };
  const hi = async (e: any, fd: string, s: (u: string) => void, prevValue?: string | null) => { const file = e.target.files?.[0]; if (!file) return; setUp(true); const url = await uploadImage(file, `${row.ref}/${fd}`); if (url) { s(url); if (fichaId) await saveFichaImagem(fichaId, fd, url); if (prevValue) await apagarImagem(prevValue); } setUp(false); };
  const hiDrop = async (e: React.DragEvent, fd: string, s: (u: string) => void, prevValue?: string | null) => { e.preventDefault(); setDragOver(null); const file = e.dataTransfer.files[0]; if (!file || !file.type.startsWith("image/")) return; setUp(true); const url = await uploadImage(file, `${row.ref}/${fd}`); if (url) { s(url); if (fichaId) await saveFichaImagem(fichaId, fd, url); if (prevValue) await apagarImagem(prevValue); } setUp(false); };
  const deleteImg = async () => { if (img) await apagarImagem(img); setImg(null); if (fichaId) await saveFichaImagem(fichaId, "imagem_url", ""); };
  const deleteImgModelo = async () => { if (imgModelo) await apagarImagem(imgModelo); setImgModelo(null); if (fichaId) await saveFichaImagem(fichaId, "imagem_modelo", ""); };
  const deleteImgModoMedir = async () => { if (imgModoMedir) await apagarImagem(imgModoMedir); setImgModoMedir(null); if (fichaId) await saveFichaImagem(fichaId, "imagem_modo_medir", ""); };
  const uploadFotoProva = async (file: File, prova: "p1"|"p2"|"p3", side: "frente"|"lado"|"costas") => {
    if (!file.type.startsWith("image/")) return;
    setUp(true);
    const field = side === "frente" ? "fotoFrente" : side === "lado" ? "fotoLado" : "fotoCostas";
    const url = await uploadImage(file, `${row.ref}/prova_${prova}_${side}`);
    if (url) setProvaInfo(prev => ({ ...prev, [prova]: { ...prev[prova], [field]: url } }));
    setUp(false);
  };
  const handleFotoProva = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file || !fotoProvaTarget) return;
    await uploadFotoProva(file, fotoProvaTarget.prova, fotoProvaTarget.side);
    if (fotoProvaRef.current) fotoProvaRef.current.value = "";
  };
  const handleDropProva = async (e: React.DragEvent, prova: "p1"|"p2"|"p3", side: "frente"|"lado"|"costas") => {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files[0];
    if (file) await uploadFotoProva(file, prova, side);
  };

  const autoStatusFor = (lib: string) => {
    if (lib === "REPROVADO") return "REPILOTANDO PRODUÇÃO";
    if (lib === "APROVADO" || lib === "APROVADO COM RESTRIÇÃO") return "PRODUÇÃO LIBERADA";
    return null;
  };

  // Popup de alerta pros outros usuários: compara o estado atual de tecidos/
  // aviamentos com o baseline (última versão salva/carregada) e dispara um
  // alerta por diferença encontrada, só quando o SKU já está liberado/repilotando.
  const alertarFichaAlterada = () => {
    if (!user || !STATUS_ALERTA.includes(row.status)) return;
    const baseline = baselineRef.current;
    const alertas: { categoria: "COR" | "TECIDO" | "AVIAMENTO"; campo: string; de: string; para: string }[] = [];

    const maxTec = Math.max(baseline.tec.length, tec.length);
    for (let i = 0; i < maxTec; i++) {
      const before = baseline.tec[i], after = tec[i];
      if (!before || !after) continue; // linha adicionada/removida — fora do escopo v1
      const label = after.artigo || before.artigo || `#${i + 1}`;
      if ((before.artigo || "") !== (after.artigo || "")) alertas.push({ categoria: "TECIDO", campo: `Tecido ${label} — artigo`, de: before.artigo || "", para: after.artigo || "" });
      if ((before.forn || "") !== (after.forn || "")) alertas.push({ categoria: "TECIDO", campo: `Tecido ${label} — fornecedor`, de: before.forn || "", para: after.forn || "" });
      if (Number(before.preco || 0) !== Number(after.preco || 0)) alertas.push({ categoria: "TECIDO", campo: `Tecido ${label} — preço`, de: String(before.preco ?? ""), para: String(after.preco ?? "") });
      const coresAntes = (before.cores || []).filter(Boolean).join(", ");
      const coresDepois = (after.cores || []).filter(Boolean).join(", ");
      if (coresAntes !== coresDepois) alertas.push({ categoria: "COR", campo: `Cores — tecido ${label}`, de: coresAntes, para: coresDepois });
    }

    const maxAvi = Math.max(baseline.avi.length, avi.length);
    for (let i = 0; i < maxAvi; i++) {
      const before = baseline.avi[i], after = avi[i];
      if (!before || !after) continue;
      const label = after.item || before.item || `#${i + 1}`;
      if ((before.cod || "") !== (after.cod || "")) alertas.push({ categoria: "AVIAMENTO", campo: `Aviamento ${label} — código`, de: before.cod || "", para: after.cod || "" });
      if (Number(before.qtd ?? 1) !== Number(after.qtd ?? 1)) alertas.push({ categoria: "AVIAMENTO", campo: `Aviamento ${label} — quantidade`, de: String(before.qtd ?? ""), para: String(after.qtd ?? "") });
      if ((before.local || "") !== (after.local || "")) alertas.push({ categoria: "AVIAMENTO", campo: `Aviamento ${label} — localização`, de: before.local || "", para: after.local || "" });
    }

    alertas.forEach(a => criarAlerta({
      produtoRef: row.ref,
      categoria: a.categoria,
      campo: a.campo,
      valorAnterior: a.de,
      valorNovo: a.para,
      statusProduto: row.status,
      alteradoPorNome: nomeUsuario(user),
      alteradoPorUserId: user.id,
    }));
  };

  const save = async (confirmed = false) => {
    const autoStatus = autoStatusFor(statusLib);
    // Se vai mudar o status do produto automaticamente, pedir confirmação (só no save manual)
    if (autoStatus && autoStatus !== row.status && !confirmed) {
      setPendingSave(true);
      return;
    }
    setSaving(true);
    setPendingSave(false);
    setAutoSaveStatus("saving");
    try {
      const fichaData = { id: fichaId, tecidos: tec, aviamentos: avi, pilotagem: pil, observacoes: obs, imagem_url: img, imagem_modelo: imgModelo, imagem_modo_medir: imgModoMedir, imagem_frente: imgFrente, imagem_costas: imgCostas, provas: pv, anotacoes: an, pantones: varCodigos, tingimento: varTingimento, qtdMost, statusLiberacao: statusLib, ncm, estamparia: { ...estamparia, numVariantes: numVars }, provaInfo, custoDet, obsCusto, pesoCalculo: peso, tabelaEspecialAtiva: tEsp, pontosEspeciais: tEsp ? ptsEsp : undefined, gradEspecial: tEsp ? gradEsp : undefined };
      const newId = await upsertFicha(row.ref, fichaData, isClassic ? selectedColecao : null);
      if (!newId) throw new Error("Falha ao salvar a ficha técnica.");
      setFichaId(newId);
      alertarFichaAlterada();
      baselineRef.current = { tec, avi };
      // Só mexe no status (e só avisa) se ele realmente muda. Sem isso, abrir a
      // ficha já disparava o auto-save e gerava um alerta "X → X" para todo
      // mundo, mesmo sem ninguém ter alterado nada.
      if (autoStatus && autoStatus !== row.status) {
        if (user && STATUS_ALERTA.includes(row.status)) {
          criarAlerta({
            produtoRef: row.ref, categoria: "STATUS", campo: "Status atual",
            valorAnterior: row.status, valorNovo: autoStatus, statusProduto: row.status,
            alteradoPorNome: nomeUsuario(user), alteradoPorUserId: user.id,
          });
        }
        await updateProdutoField(row.id, "status", autoStatus);
      }
      // Variantes só derivam das cores dos tecidos — evita recarregar a lista
      // inteira de variantes do sistema a cada auto-save (a cada 1.5s de edição)
      // quando o que mudou foi só, por exemplo, uma observação ou o NCM.
      const coresSignature = JSON.stringify(tec.map((t: any) => t.cores || []));
      const variantesChanged = coresSignature !== lastCoresRef.current;
      lastCoresRef.current = coresSignature;
      onSave({ ...row, ...(autoStatus ? { status: autoStatus } : {}), ficha: { ...fichaData, id: newId || fichaId } }, variantesChanged);
      setAutoSaveStatus("saved");
      setTimeout(() => setAutoSaveStatus("idle"), 3500);
    } catch {
      setAutoSaveStatus("error");
      setTimeout(() => setAutoSaveStatus("idle"), 3000);
    }
    setSaving(false);
  };

  // Mantém saveRef sempre atualizado (evita closures stale no auto-save)
  saveRef.current = save;

  // Habilita auto-save 3s após o mount e salva o estado atual (captura edições feitas durante o carregamento)
  useEffect(() => {
    const t = setTimeout(() => {
      isLoaded.current = true;
      saveRef.current?.(true);
    }, 3000);
    return () => { clearTimeout(t); isLoaded.current = false; };
  }, []);

  // Auto-save: debounce de 1.5s após qualquer alteração
  useEffect(() => {
    if (!isLoaded.current) return;
    setAutoSaveStatus("pending");
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveRef.current?.(true);
    }, 1500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tec, avi, pil, obs, pv, an, provaInfo, estamparia, varCodigos, varTingimento, qtdMost, statusLib, ncm, numVars, custoDet, obsCusto, peso, tEsp, img, imgModelo, imgModoMedir, imgFrente, imgCostas]);

  const exportPDF = () => { setShowExportDlg(true); };
  const doExport = () => {
    setShowExportDlg(false);
    setShowPrint(true);
    document.body.classList.add("printing-pdf");
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const pdfName = `${row.ref} - ${dd}-${mm}-${yyyy}`;
    const prevTitle = document.title;
    const onBefore = () => { document.title = pdfName; };
    const onAfter = () => {
      document.title = prevTitle;
      window.removeEventListener('beforeprint', onBefore);
      window.removeEventListener('afterprint', onAfter);
      setTimeout(() => { setShowPrint(false); document.body.classList.remove("printing-pdf"); }, 300);
    };
    window.addEventListener('beforeprint', onBefore);
    window.addEventListener('afterprint', onAfter);
    document.title = pdfName;
    setTimeout(() => { window.print(); }, 300);
  };

  const compOf = (nome: string) => tecCad.find((t: any) => t.nome === nome)?.comp || "";
  // Foto do tecido vem do cadastro (Cadastros › Tecidos), não da ficha
  const imgTecOf = (nome: string) => tecCad.find((t: any) => t.nome === nome)?.imagem || "";

  // Peso = área da modelagem × gramatura do tecido × encolhimento × margem.
  // Usa o 1º tecido da ficha (o principal); se a ficha não tem tecido, cai no
  // tecido do produto.
  const nomeTecidoPeso = tec[0]?.artigo || row.tecido || "";
  const calcularPeso = () => {
    const t = (tecCad || []).find((x: any) => x.nome === nomeTecidoPeso);
    setPeso(calcularPesoPeca(areaMedia, t));
  };

  const gerarNcm = () => {
    setNcmLoading(true);
    try {
      const result = classificarNCM({
        grupo: row.grupo || "",
        subgrupo: row.subgrupo || "",
        categoria: row.categoria || "",
        tecido: row.tecido || "",
        composicao: compOf(row.tecido),
        descricao: row.desc || "",
      });
      setNcm(result.ncm);
      setNcmJust(result.justificativa);
    } catch {
      setNcmJust("Erro ao classificar NCM.");
    }
    setNcmLoading(false);
  };

  const avT = custoAviamentosPorPeca(avi, row.grade, row.linha);
  const utc = (ti: number, ci: number, v: string) => setTec(p => p.map((t: any, i: number) => { if (i !== ti) return t; const c = [...(t.cores || [])]; while (c.length < 6) c.push(""); c[ci] = v; return { ...t, cores: c }; }));
  const ua = (i: number, k: string, v: any) => setAvi(p => p.map((a, j) => j === i ? { ...a, [k]: v } : a));
  const ra = (i: number) => setAvi(p => p.filter((_, j) => j !== i));
  const aa = (a: any) => {
    const cores = a.cores_disponiveis || [];
    const autoColor = cores.length === 1 ? cores[0] : "";
    const activeCount = tec[0]?.cores?.filter(Boolean).length || numVars;
    const vf: Record<string,string> = {};
    if (autoColor) (["var01","var02","var03","var04","var05","var06"] as const).slice(0, activeCount).forEach(k => vf[k] = autoColor);
    setAvi(p => [...p, { item: a.nome, cod: a.cod, qtd: 1, valor: a.preco, local: a.localizacao_padrao || "", imagem: a.imagem || "", imagens_cores: a.imagens_cores || {}, cores_disponiveis: cores, fornecedor: a.fornecedor || "", codigo_fornecedor: a.codigo_fornecedor || "", var01: vf.var01||"", var02: vf.var02||"", var03: vf.var03||"", var04: vf.var04||"", var05: vf.var05||"", var06: vf.var06||"" }]);
    setSap(false); setAsq("");
  };
  const fa = asq ? avCad.filter((a: any) => (a.cod + a.nome).toLowerCase().includes(asq.toLowerCase())) : avCad;
  // tamNum (e não parseFloat) porque medida e tabela vêm com vírgula decimal
  // ("2,5"): parseFloat pararia na vírgula e compararia contra 2.
  const gd = (t: string, m: string) => { if (!m) return ""; const a = tamNum(t), b = tamNum(m); if (isNaN(a) || isNaN(b)) return ""; const d = b - a; return d === 0 ? "0" : d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1); };
  const gc = (t: string, m: string) => { if (!m) return ""; const d = tamNum(m) - tamNum(t); if (isNaN(d)) return ""; return d === 0 ? "text-[var(--system-green)]" : "font-bold text-red-600 bg-yellow-100"; };
  // Enter/Tab na tabela de medidas vai pro campo abaixo (mesma coluna, próxima
  // linha) em vez do próximo campo à direita — mais rápido pra digitar medida
  // por medida descendo a lista de pontos.
  const focusCampoAbaixo = (e: React.KeyboardEvent, idAbaixo: string) => {
    if (e.key !== "Enter" && e.key !== "Tab") return;
    const next = document.getElementById(idAbaixo) as HTMLInputElement | null;
    if (!next) return;
    e.preventDefault();
    next.focus();
    next.select();
  };
  const tm = row.tab_medidas || "";
  const hasEstamparia = (estamparia?.tecnicas || []).length > 0 || (estamparia?.artes || []).some((a: any) => a.imagem || a.largura || a.localizacao);

  /* ── Estamparia helpers ── */
  const updArte = (posicao: string, field: string, value: string) => setEstamparia((prev: any) => ({ ...prev, artes: (prev.artes || []).map((a: any) => a.posicao === posicao ? { ...a, [field]: value } : a) }));
  const updTecnica = (i: number, field: string, value: string) => setEstamparia((prev: any) => ({ ...prev, tecnicas: prev.tecnicas.map((t: any, j: number) => j === i ? { ...t, [field]: value } : t) }));
  const addTecnica = () => setEstamparia((prev: any) => ({ ...prev, tecnicas: [...prev.tecnicas, { tecnica: "", var01: "", var02: "", var03: "", var04: "", var05: "", var06: "" }] }));
  const _s = (row.status || "").toUpperCase();
  const fichaColor = (_s.includes('CANCELADO')) ? '#EA2F46' : (_s.includes('PRODUÇÃO') || _s.includes('PRODUCAO') || _s.includes('REPILOTANDO')) ? '#2DB564' : (_s.includes('MOSTRUÁRIO') || _s.includes('MOSTRUARIO')) ? '#EDCA35' : '#4464AF';
  const isMost = _s.includes('MOSTRUÁRIO') || _s.includes('MOSTRUARIO');
  const isProd = _s.includes('PRODUÇÃO') || _s.includes('PRODUCAO') || _s.includes('REPILOTANDO');
  const isRepilotando = _s.includes('REPILOTANDO');
  const showQtdRow = isMost || isProd;
  const qtdRowLabel = isProd ? 'QTD. COMPRA 1' : 'QTD. MOSTRUÁRIO';
  // Helper: pega dados da compra por variante (key = produtoId:cor)
  const vcFor = (varKey: "var01"|"var02"|"var03"|"var04"|"var05"|"var06") => {
    const idx = Number(varKey.slice(3)) - 1;
    const cor = tec[0]?.cores?.[idx];
    if (!cor) return null;
    return vcCompras[`${row.id}:${cor}`] || null;
  };
  const hasComprasData = row.qtd_compra1 || row.pedido1 || row.qtd_compra2 || row.pedido2;
  const modelagemColor = statusLib === 'REPROVADO' ? '#EA2F46' : (statusLib === 'APROVADO' || statusLib === 'APROVADO COM RESTRIÇÃO') ? '#2DB564' : '#4464AF';
  const removeTecnica = (i: number) => setEstamparia((prev: any) => ({ ...prev, tecnicas: prev.tecnicas.filter((_: any, j: number) => j !== i) }));
  const updSim = (vk: string, field: string, value: string) => setEstamparia((prev: any) => ({ ...prev, simulacoes: { ...prev.simulacoes, [vk]: { ...(prev.simulacoes?.[vk] || {}), [field]: value } } }));
  const estImgPath = (type: string, key: string) => {
    if (type === "arte")      return `${row.ref}/estamparia/arte_${key}`;
    if (type === "arteLocal") return `${row.ref}/estamparia/local_${key}`;
    if (type === "sim")       return `${row.ref}/estamparia/sim_${key}`;
    if (type === "foto")      return `${row.ref}/estamparia/foto_${key}`;
    return `${row.ref}/estamparia/${key}`;
  };
  const handleEstImg = async (e: any) => { const file = e.target.files?.[0]; if (!file || !estImgTarget) return; setUp(true); const url = await uploadImage(file, estImgPath(estImgTarget.type, estImgTarget.key)); if (url) { if (estImgTarget.type === "arte") updArte(estImgTarget.key, "imagem", url); else if (estImgTarget.type === "arteLocal") updArte(estImgTarget.key, "imagemLocal", url); else if (estImgTarget.type === "sim") updSim(estImgTarget.key, "imgSim", url); else if (estImgTarget.type === "foto") updSim(estImgTarget.key, "imgFoto", url); } setUp(false); setEstImgTarget(null); if (estImgRef.current) estImgRef.current.value = ""; };
  const triggerEstImg = (type: string, key: string) => { setEstImgTarget({ type, key }); setTimeout(() => estImgRef.current?.click(), 0); };
  const dropEstImg = async (e: React.DragEvent, type: string, key: string) => { e.preventDefault(); setDragOver(null); const file = e.dataTransfer.files[0]; if (!file || !file.type.startsWith("image/")) return; setUp(true); const url = await uploadImage(file, estImgPath(type, key)); if (url) { if (type === "arte") updArte(key, "imagem", url); else if (type === "arteLocal") updArte(key, "imagemLocal", url); else if (type === "sim") updSim(key, "imgSim", url); else if (type === "foto") updSim(key, "imgFoto", url); } setUp(false); };
  const deleteEstImg = async (type: string, key: string, url: string) => { if (url) await deleteImage(url); if (type === "arte") updArte(key, "imagem", ""); else if (type === "arteLocal") updArte(key, "imagemLocal", ""); else if (type === "sim") updSim(key, "imgSim", ""); else if (type === "foto") updSim(key, "imgFoto", ""); };
  const TECNICAS_OPTS = ["SILK ZERO TOQUE", "SILK TRADICIONAL", "SILK HD", "SUBLIMAÇÃO", "TRANSFER", "DTF", "DTG", "BORDADO", "LASER", "HOT STAMPING"];

  /* ── Tabela Especial helpers ── */
  const toggleEsp = () => {
    if (!tEsp) {
      if (!ptsEsp.length && pts.length) setPtsEsp(pts.map(p => ({ ...p })));
      if (!gradEsp.length && grad.length) setGradEsp(grad.map(g => ({ ...g, valores: { ...g.valores }, ampliacoes: { ...g.ampliacoes } })));
    }
    setTEsp(!tEsp);
  };
  // A medida do tamanho base é UMA só: aparece no quadro de medidas e na coluna
  // base da graduação. Editar em qualquer um dos dois altera os dois e recalcula
  // os demais tamanhos usando as AMPLIAÇÕES DA TABELA ORIGINAL (copiadas em
  // toggleEsp) — a graduação da especial segue a original, só deslocada pela
  // medida informada. Nada disso toca as tabelas do cadastro: a especial é
  // gravada por ficha (ficha_pontos_especiais / ficha_graduacao_especial).
  const updMedidaEsp = (i: number, v: string) => {
    setPtsEsp(prev => prev.map((p, j) => j === i ? { ...p, tabela: v } : p));
    setGradEsp(prev => prev.map((g, j) => j === i ? { ...g, valores: calcularDaBase(g, gradTamanhos, gradBase, v) } : g));
  };
  const updPtsEsp = (i: number, k: string, v: string) => {
    if (k === "tabela") return updMedidaEsp(i, v);
    setPtsEsp(prev => prev.map((p, j) => j === i ? { ...p, [k]: v } : p));
  };
  /* pontos ativos e grad ativos (especial ou original) */
  const ptsAtivo = tEsp ? ptsEsp : pts;
  const gradAtivo = tEsp ? gradEsp : grad;
  /* Colunas de tamanho da graduação: as da grade do produto, dentro do que a
     tabela define (tamanhos de ponta que a grade pede — XPP, XGG — são
     derivados por valorNoTamanho). */
  const gradTamanhos = tamanhosParaExibir(tabTamanhos, row.grade);
  const gradBase = tabBase || tabTamanhos[Math.floor(tabTamanhos.length / 2)] || "";
  const valorGrad = (g: any, t: string) => valorNoTamanho(g, t, tabTamanhos);

  // Print mode — render only the PDF component
  if (showPrint) {
    return (
      <div className="print-overlay">
        <FichaPDF row={row} tec={tec} avi={avi} pil={pil} pts={tEsp ? ptsEsp : pts} grad={tEsp ? gradEsp : grad} pv={pv} an={an} img={img} imgModelo={imgModelo} imgModoMedir={imgModoMedir} imgFrente={imgFrente} imgCostas={imgCostas} hasEstamparia={hasEstamparia} estamparia={estamparia} pantones={varCodigos} obs={obs} statusLib={statusLib} tecCad={tecCad} tabelaEspecial={tEsp} sections={exportSections} ncm={ncm} peso={peso} vcCompras={vcCompras} provaInfo={provaInfo} gradTamanhos={gradTamanhos} gradBase={gradBase} tabTamanhos={tabTamanhos} />
      </div>
    );
  }

  const handleClose = async () => {
    if (autoSaveStatus === "pending" || autoSaveStatus === "saving") {
      const confirmed = await confirm({
        title: "Alterações em andamento",
        message: "Existem alterações ainda sendo salvas. Deseja fechar mesmo assim?",
        confirmLabel: "Fechar",
        cancelLabel: "Continuar salvando",
      });
      if (!confirmed) return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-8 overflow-y-auto bg-black/30 backdrop-blur-[6px] no-print" onClick={handleClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="ficha-modal-title" className="bg-[var(--bg-primary)] rounded-2xl w-full max-w-[980px] shadow-[0_24px_80px_rgba(0,0,0,0.18)] overflow-hidden" onClick={e => e.stopPropagation()}>
        {!isDataLoaded && <SkeletonLoader count={8} />}
        {isDataLoaded && (
        <div>
          <div id="ficha-modal-title" className="sr-only">Ficha técnica de {row.ref}</div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-3 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-[var(--separator)] gap-2.5">
          <div className="seg-control overflow-x-auto">
            {([
              ["ficha", "Ficha técnica"],
              ["estamparia", "Estamparia"],
              ["liberacao", "Liberação"],
              ...(isProd && (statusLib === "APROVADO" || statusLib === "APROVADO COM RESTRIÇÃO") ? [["graduacao", "Graduação Prod."]] : []),
            ] as [string, string][]).map(([id, l]) => (
              <button key={id} onClick={() => setTab(id as any)} className={`seg-btn whitespace-nowrap ${tab === id ? "active" : ""}${id === "graduacao" ? " !text-[#2DB564] font-bold" : ""}`}>{l}</button>
            ))}
          </div>
          <div className="flex gap-2 sm:gap-2.5 items-center justify-end flex-shrink-0">
            {/* Indicador de auto-save */}
            {up && <span className="text-[12px] text-[var(--system-blue)] animate-pulse font-medium">Enviando...</span>}
            {!up && autoSaveStatus === "pending" && (
              <span className="text-[11px] font-semibold text-[#B45309] bg-[#FEF3C7] border border-[#FDE68A] px-2 py-0.5 rounded-full flex items-center gap-1">
                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Alterações não salvas
              </span>
            )}
            {!up && autoSaveStatus === "saving" && <span className="text-[11px] text-[var(--system-blue)] animate-pulse font-medium">Salvando...</span>}
            {!up && autoSaveStatus === "saved" && (
              <span className="text-[11px] text-[#2DB564] font-medium flex items-center gap-1">
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                Salvo
              </span>
            )}
            {!up && autoSaveStatus === "error" && (
              <span className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full flex items-center gap-1 cursor-pointer" onClick={() => saveRef.current?.(true)}>
                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Erro — clique para tentar novamente
              </span>
            )}
            <button onClick={exportPDF} className="text-[12px] sm:text-[13px] font-medium text-[var(--system-blue)] hover:bg-blue-50 px-2 sm:px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
              <svg aria-hidden="true" className="inline mr-1" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span className="hidden sm:inline">Exportar </span>PDF
            </button>
            <button onClick={handleClose} aria-label="Fechar" className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] flex items-center justify-center text-[var(--label-secondary)] flex-shrink-0">
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </div>

        {/* ═══ EXPORT DIALOG ═══ */}
        {showExportDlg && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-[4px]" onClick={() => setShowExportDlg(false)}>
            <div className="bg-[var(--bg-primary)] rounded-2xl w-[calc(100%-32px)] max-w-[380px] shadow-[0_24px_80px_rgba(0,0,0,0.2)] overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-6 pt-5 pb-3 border-b border-[var(--separator)]">
                <h3 className="text-[16px] font-bold">Exportar PDF</h3>
                <p className="text-[12px] text-[var(--label-secondary)] mt-1">Selecione as seções para exportar:</p>
              </div>
              <div className="px-6 py-4 space-y-3">
                {([
                  ["ficha", "Ficha Técnica", "Dados do produto, tecidos, aviamentos, pilotagem"],
                  ["estamparia", "Estamparia", "Artes, técnicas, simulações e fotos"],
                  ["liberacao", "Liberação", "Tabela de medidas, provas e graduação"],
                  ...(isProd && (statusLib === "APROVADO" || statusLib === "APROVADO COM RESTRIÇÃO") ? [["graduacao", "Graduação de Produção", "Tabela graduada com medidas aprovadas para envio ao fornecedor"]] : []),
                ] as [string, string, string][]).map(([key, label, desc]) => (
                  <label key={key} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${(exportSections as any)[key] ? "border-[var(--system-blue)] bg-[rgba(0,122,255,0.04)]" : "border-[var(--separator-opaque)] hover:border-[var(--label-tertiary)]"}`}>
                    <input type="checkbox" checked={(exportSections as any)[key]} onChange={e => setExportSections(prev => ({ ...prev, [key]: e.target.checked }))} className="mt-0.5 w-4 h-4 accent-[var(--system-blue)]" />
                    <div>
                      <div className="text-[13px] font-semibold">{label}</div>
                      <div className="text-[11px] text-[var(--label-tertiary)]">{desc}</div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="px-6 pb-5 flex gap-2.5 justify-end">
                <button onClick={() => setShowExportDlg(false)} className="apple-btn-secondary">Cancelar</button>
                <button onClick={doExport} disabled={!exportSections.ficha && !exportSections.estamparia && !exportSections.liberacao} className="apple-btn-primary disabled:opacity-40">Exportar</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ FICHA TÉCNICA ═══ */}
        {tab === "ficha" && (<div className="px-3 sm:px-6 py-4 sm:py-6 space-y-5">
          <div style={{ background: fichaColor }} className="text-white rounded-xl px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-bold">FICHA TÉCNICA</span>
            <span className="text-[11px] font-semibold bg-white/15 px-3 py-0.5 rounded-full whitespace-nowrap">{(s => s.includes("REPILOTANDO") ? "REPILOTANDO PRODUÇÃO" : s.includes("PRODUÇÃO") || s.includes("PRODUCAO") ? "PRODUÇÃO" : s.includes("MOSTRUÁRIO") || s.includes("MOSTRUARIO") ? "MOSTRUÁRIO" : s.includes("CANCELADO") ? "CANCELADO" : "DESENVOLVIMENTO")((row.status || "").toUpperCase())}</span>
            <span className="text-[12px]"><span className="text-white/50">Coleção</span> <span className="font-semibold ml-1">{row.colecao}</span></span>
          </div>

          {/* Seletor de temporada — apenas para refs clássicas */}
          {isClassic && (
            <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--separator)", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--label-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>Temporada:</span>
              {colecaoOpts.map(c => (
                <div key={c}
                  draggable={editandoTemporadas}
                  onDragStart={() => { draggedTemporadaRef.current = c; }}
                  onDragOver={e => editandoTemporadas && e.preventDefault()}
                  onDrop={e => { e.preventDefault(); moverTemporada(c); }}
                  style={{ display: "flex", alignItems: "center", gap: 2, cursor: editandoTemporadas ? "grab" : undefined }}
                >
                  <button onClick={() => { if (!editandoTemporadas) { setSelectedColecao(c); setNewColecaoMode(false); } }}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20, border: "1.5px solid",
                      cursor: editandoTemporadas ? "grab" : "pointer", transition: "all .15s",
                      background: selectedColecao === c ? "var(--system-blue)" : "var(--bg-primary)",
                      borderColor: selectedColecao === c ? "var(--system-blue)" : "var(--separator)",
                      color: selectedColecao === c ? "#fff" : "var(--label-primary)",
                    }}>{c}</button>
                  {editandoTemporadas && (
                    <button onClick={() => excluirTemporada(c)} disabled={colecaoOpts.length <= 1}
                      title={colecaoOpts.length <= 1 ? "Precisa sobrar pelo menos uma temporada" : `Excluir ${c}`}
                      style={{
                        fontSize: 11, width: 20, height: 20, borderRadius: "50%", border: "1px solid var(--separator)",
                        background: "var(--bg-tertiary)", color: "var(--label-secondary)",
                        cursor: colecaoOpts.length <= 1 ? "not-allowed" : "pointer",
                        opacity: colecaoOpts.length <= 1 ? 0.4 : 1,
                      }}>✕</button>
                  )}
                </div>
              ))}
              <button onClick={() => setEditandoTemporadas(p => !p)}
                title={editandoTemporadas ? "Concluir edição" : "Reordenar/excluir temporadas"}
                style={{
                  fontSize: 12, padding: "4px 10px", borderRadius: 20, border: "1.5px solid var(--separator)",
                  background: editandoTemporadas ? "var(--system-blue)" : "transparent",
                  color: editandoTemporadas ? "#fff" : "var(--label-secondary)", cursor: "pointer",
                }}>{editandoTemporadas ? "Concluir" : "✎ Editar"}</button>
              {!newColecaoMode ? (
                <button onClick={() => setNewColecaoMode(true)}
                  style={{ fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20, border: "1.5px dashed var(--separator)", background: "transparent", color: "var(--system-blue)", cursor: "pointer" }}>
                  + Adicionar temporada
                </button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <select
                    autoFocus
                    defaultValue=""
                    onChange={e => { if (e.target.value) adicionarTemporada(e.target.value); }}
                    style={{ fontSize: 12, padding: "4px 10px", borderRadius: 8, border: "1px solid var(--system-blue)", background: "var(--bg-primary)", color: "var(--label-primary)", outline: "none" }}
                  >
                    <option value="">Selecionar coleção…</option>
                    {colecaoCadOpts.filter(c => !colecaoOpts.includes(c)).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <button onClick={() => setNewColecaoMode(false)}
                    style={{ fontSize: 11, padding: "4px 8px", borderRadius: 8, background: "var(--bg-tertiary)", color: "var(--label-secondary)", border: "1px solid var(--separator)", cursor: "pointer" }}>✕</button>
                </div>
              )}
              {colecaoOpts.length === 0 && !newColecaoMode && (
                <span style={{ fontSize: 11, color: "var(--label-tertiary)", fontStyle: "italic" }}>Nenhuma temporada criada ainda</span>
              )}
            </div>
          )}
          <div className="apple-card">
            <div className="grid grid-cols-1 sm:grid-cols-2">{([["Referência", row.ref], ["Descrição", row.desc], ["Tecido", row.tecido], ["Forn. tecido", row.forn_tecido], ["Composição", row.composicao || compOf(row.tecido)], ["Operação", row.operacao], ["Fornecedor", row.fornecedor], ["Estilista", row.estilista], ["Tab. medidas", row.tab_medidas]] as [string, any][]).map(([l, v]) => <F key={l} l={l} v={v} />)}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4">{([["Drop", row.drop], ["Grade", row.grade], ["Tipo", row.tipo], ["Linha", row.linha]] as [string, any][]).map(([l, v]) => <F key={l} l={l} v={v} />)}</div>
            <div className="border-t border-[var(--separator)]" />
            <div className="grid grid-cols-2 sm:grid-cols-3">{([["Grupo", row.grupo], ["Subgrupo", row.subgrupo], ["Categoria", row.categoria], ["Subcategoria", row.subcategoria], ["Tipo", row.tipo]] as [string, any][]).map(([l, v]) => <F key={l} l={l} v={v} />)}<div /></div>
            <div className="border-t border-[var(--separator)]" />
            <div className="px-4 py-3 flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="text-[11px] text-[var(--label-secondary)] font-medium whitespace-nowrap">NCM:</span>
              <input type="text" value={ncm} onChange={e => { setNcm(e.target.value); setNcmJust(""); }} placeholder="0000.00.00" className="w-[120px] sm:w-[140px] text-[13px] font-mono font-semibold tabnum border border-[var(--separator-opaque)] rounded-lg px-3 py-1.5 outline-none focus:border-[var(--system-blue)]" />
              <button onClick={gerarNcm} disabled={ncmLoading} className="apple-btn-secondary text-[12px] !py-1.5 !px-3 flex items-center gap-1.5">
                {ncmLoading ? <span className="animate-pulse">Gerando...</span> : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>Gerar NCM</>}
              </button>
              {ncmJust && <span className="text-[11px] text-[var(--label-tertiary)] truncate w-full sm:w-auto sm:flex-1" title={ncmJust}>{ncmJust}</span>}
            </div>
            <div className="border-t border-[var(--separator)]" />
            <div className="px-4 py-3 flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="text-[11px] text-[var(--label-secondary)] font-medium whitespace-nowrap">Peso médio:</span>
              <div className="text-[15px] font-bold tabnum min-w-[92px]">
                {peso?.pesoG != null ? <>{peso.pesoG.toLocaleString("pt-BR")} <span className="text-[12px] font-semibold text-[var(--label-tertiary)]">g</span></> : <span className="text-[13px] font-normal text-[var(--label-quaternary)]">—</span>}
              </div>
              <button onClick={calcularPeso} className="apple-btn-secondary text-[12px] !py-1.5 !px-3 flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M5 6h14l-2.5 5h-9L5 6z"/><path d="M3 21h18M7 21v-5a5 5 0 0110 0v5"/></svg>
                Calcular peso
              </button>
              {peso && (
                peso.pesoG == null ? (
                  <span className="text-[11px] text-[var(--system-orange)] w-full sm:w-auto sm:flex-1">
                    Faltou preencher: {peso.faltando.join(" e ")}.
                    {peso.faltando.some(f => f.includes("gramatura")) && nomeTecidoPeso ? ` (tecido ${nomeTecidoPeso}, em Cadastros › Tecidos)` : ""}
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--label-tertiary)] w-full sm:w-auto sm:flex-1">
                    {peso.area?.toLocaleString("pt-BR")} m² × {peso.gramatura?.toLocaleString("pt-BR")} g/m²
                    {peso.origemGramatura === "rendimento" ? " (do rendimento × largura)" : ""}
                    {peso.origemGramatura === "oz" ? " (do oz do tecido)" : ""}
                    {peso.encolhimentoIgnorado ? " · sem encolhimento informado" : ` × ${peso.fatorEncolhimento.toLocaleString("pt-BR")} de encolhimento`}
                    {" "}× 1,10 de margem
                  </span>
                )
              )}
            </div>
          </div>
          <div className={`apple-card bg-[var(--bg-secondary)] cursor-pointer hover:border-[var(--system-blue)] relative transition-colors ${dragOver === "img" ? "border-[var(--system-blue)] bg-blue-50/40" : ""}`}
            onClick={() => fr.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver("img"); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => hiDrop(e, "imagem_url", setImg, img)}>
            <div className="aspect-[16/9] max-h-[380px] flex items-center justify-center">{img ? <img src={img} alt="Desenho" className="w-full h-full object-contain p-3" /> : <div className="text-center"><svg className="mx-auto mb-2 text-[var(--label-quaternary)]" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg><p className="text-[13px] text-[var(--label-tertiary)]">Arrastar aqui ou clique</p></div>}</div>
            {/* Foto do tecido, junto do desenho — só dos tecidos que têm foto no cadastro.
                stopPropagation: o card inteiro abre o seletor de arquivo do desenho. */}
            {tec.some((t: any) => imgTecOf(t.artigo)) && (
              <div onClick={e => e.stopPropagation()} className="flex flex-wrap items-center gap-3 px-3 py-2.5 border-t border-[var(--separator)] bg-[var(--bg-primary)] cursor-default">
                {tec.map((t: any, ti: number) => {
                  const u = imgTecOf(t.artigo);
                  if (!u) return null;
                  return (
                    <div key={ti} className="flex items-center gap-2">
                      <img src={u} alt={`Tecido ${t.artigo}`} className="w-20 h-20 rounded-lg object-cover border border-[var(--separator)] bg-white" />
                      <div className="leading-tight">
                        <div className="text-[10px] text-[var(--label-tertiary)]">Tec.{String(ti + 1).padStart(2, "0")}</div>
                        <div className="text-[12px] font-semibold">{t.artigo}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {img && <button onClick={e => { e.stopPropagation(); deleteImg(); }} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
          </div>
          <input ref={fr} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => hi(e, "imagem_url", setImg, img)} />

          <div className="apple-card overflow-x-auto"><table className="plm-table"><thead><tr><th className="px-4">Artigo</th><th className="w-24">Fornec.</th><th className="w-36">Composição</th><th className="text-center w-16">Preço</th>{Array.from({length: numVars}, (_, i) => { const cor = tec[0]?.cores?.[i]; const pal = cor ? COR_PALETTE[cor] : null; return (<th key={i} className="text-center w-[120px]"><div>Var {String(i+1).padStart(2,"0")}</div>{cor && <div className="mt-1 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold" style={pal ? { background: pal.bg, color: pal.text } : { background: "var(--bg-tertiary)", color: "var(--label-secondary)" }}>{cor}</div>}</th>); })}</tr></thead><tbody>{tec.map((t: any, ti: number) => { const cs = t.cores || []; while (cs.length < numVars) cs.push(""); return (<tr key={ti}><td className="px-4"><span className="text-[var(--label-tertiary)] text-[11px] mr-1.5">Tec.{String(ti + 1).padStart(2, "0")}</span><span className="font-semibold">{t.artigo}</span></td><td>{t.forn}</td><td className="text-[12px] text-[var(--label-secondary)] px-3">{compOf(t.artigo) || "—"}</td><td className="text-center tabnum">{t.preco > 0 ? t.preco.toFixed(2) : "—"}</td>{cs.slice(0, numVars).map((c: string, ci: number) => { const pal = c ? COR_PALETTE[c] : null; return (<td key={ci} className="px-1.5 py-1.5"><select value={c} onChange={e => utc(ti, ci, e.target.value)} className="w-full text-[12px] px-2 py-1.5 rounded-lg border outline-none cursor-pointer font-bold" style={pal ? { background: pal.bg, color: pal.text, borderColor: pal.bg } : { borderColor: "var(--separator-opaque)", color: "var(--label-quaternary)" }}><option value="">Selecionar</option>{corOpts.map(x => <option key={x} value={x}>{x}</option>)}</select></td>); })}</tr>); })}</tbody><tfoot>
                <tr className="border-t border-[var(--separator-opaque)] bg-[var(--bg-secondary)]">
                  <td colSpan={3} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)] whitespace-nowrap">Pantone / Código</td>
                  <td />
                  {(["var01","var02","var03","var04","var05","var06"] as const).slice(0, numVars).map(k => (
                    <td key={k} className="px-1.5 py-1.5">
                      <textarea
                        value={varCodigos[k]}
                        onChange={e => setVarCodigos(prev => ({ ...prev, [k]: e.target.value }))}
                        placeholder="P. 000 C"
                        rows={1}
                        className="w-full text-[12px] px-2 py-1.5 rounded-lg border border-[var(--separator-opaque)] outline-none focus:border-[var(--system-blue)] text-center font-mono tracking-wide resize-none overflow-hidden"
                        style={{ minHeight: "32px" }}
                        onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }}
                      />
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-[var(--separator-opaque)]">
                  <td colSpan={3} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)] whitespace-nowrap">Tipo de Tingimento</td>
                  <td />
                  {(["var01","var02","var03","var04","var05","var06"] as const).slice(0, numVars).map(k => (
                    <td key={k} className="px-1.5 py-1.5">
                      <select
                        value={varTingimento[k]}
                        onChange={e => setVarTingimento(prev => ({ ...prev, [k]: e.target.value }))}
                        className="w-full text-[11px] px-2 py-1.5 rounded-lg border border-[var(--separator-opaque)] outline-none focus:border-[var(--system-blue)]"
                      >
                        <option value="">—</option>
                        {Array.from(new Set(tingimentoOpts.length ? tingimentoOpts : ["AMACIADO","CORASTONED","ESTONADO","FIO TINTO","MARMORIZADO LEVE","REATIVO","SOBRETINTO","SPRAY LOCALIZADO","TINTO A SECO","TINTO EM ROLO"])).sort().map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                  ))}
                </tr>
                {showQtdRow && (
                <tr className="border-t-2 border-[var(--system-blue)]/30 bg-blue-50/40">
                  <td colSpan={3} className="px-4 py-2.5 whitespace-nowrap">
                    <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--system-blue)]">{qtdRowLabel}</span>
                    <span className="text-[10px] text-[var(--label-tertiary)] ml-1.5">pçs / cor</span>
                  </td>
                  <td />
                  {(["var01","var02","var03","var04","var05","var06"] as const).slice(0, numVars).map(k => {
                    if (isProd) {
                      const vc = vcFor(k);
                      const qtd = vc?.qtd_compra1;
                      return (
                        <td key={k} className="px-1.5 py-1.5">
                          <div className="w-full text-[13px] font-bold tabnum text-center px-2 py-1.5 rounded-lg border border-[var(--separator-opaque)] bg-[var(--bg-secondary)] text-[var(--label-primary)]" title="Preenchido em Compras > Variantes (somente leitura)">
                            {qtd != null && qtd !== "" ? Math.round(Number(qtd)) : "—"}
                          </div>
                        </td>
                      );
                    }
                    return (
                      <td key={k} className="px-1.5 py-1.5">
                        <input
                          type="number"
                          min={0}
                          value={qtdMost[k] ?? ""}
                          onChange={e => setQtdMost(prev => ({ ...prev, [k]: e.target.value === "" ? null : Number(e.target.value) }))}
                          placeholder="0"
                          className="w-full text-[13px] font-bold tabnum text-center px-2 py-1.5 rounded-lg border border-[var(--system-blue)]/40 bg-white outline-none focus:border-[var(--system-blue)] focus:ring-1 focus:ring-[var(--system-blue)]/20"
                        />
                      </td>
                    );
                  })}
                </tr>
                )}
                {isProd && (
                <tr className="border-t border-[var(--system-blue)]/20 bg-blue-50/40">
                  <td colSpan={3} className="px-4 py-2.5 whitespace-nowrap">
                    <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--system-blue)]">NÚMERO DO PEDIDO 1</span>
                    <span className="text-[10px] text-[var(--label-tertiary)] ml-1.5">por cor</span>
                  </td>
                  <td />
                  {(["var01","var02","var03","var04","var05","var06"] as const).slice(0, numVars).map(k => {
                    const vc = vcFor(k);
                    const ped = vc?.pedido1;
                    return (
                      <td key={k} className="px-1.5 py-1.5">
                        <div className="w-full text-[12px] font-semibold text-center px-2 py-1.5 rounded-lg border border-[var(--separator-opaque)] bg-[var(--bg-secondary)] text-[var(--label-primary)] truncate" title={ped || "Preenchido em Compras > Variantes (somente leitura)"}>
                          {ped || "—"}
                        </div>
                      </td>
                    );
                  })}
                </tr>
                )}
              </tfoot></table></div>
          <div className="flex gap-2 mt-2 mb-1">
            {numVars > 1 && <button onClick={() => setNumVars(n => n - 1)} className="apple-btn-secondary text-[12px]">− Remover variante</button>}
            {numVars < 6 && <button onClick={() => setNumVars(n => n + 1)} className="apple-btn-secondary text-[12px]">+ Adicionar variante</button>}
            {tec.length < 2 && (
              <button
                onClick={() => setTec(p => [...p, { artigo: "", forn: "", composicao: "", preco: 0, cores: Array(numVars).fill("") }])}
                className="apple-btn-secondary text-[12px]"
              >+ Segundo tecido</button>
            )}
            {tec.length > 1 && (
              <button
                onClick={() => setTec(p => p.slice(0, -1))}
                className="apple-btn-secondary text-[12px] text-[var(--system-red)]"
              >− Remover segundo tecido</button>
            )}
          </div>

          {hasComprasData && (
            <div className="apple-card p-0 overflow-hidden border border-[var(--separator)]">
              <div className="px-4 py-2.5 bg-[var(--bg-secondary)] border-b border-[var(--separator)] flex items-center gap-2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--system-blue)" strokeWidth="2.2" strokeLinecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--system-blue)]">Informações de Compras</span>
              </div>
              <div className="grid grid-cols-2 divide-x divide-[var(--separator)]">
                <div className="p-4 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--label-tertiary)] mb-3">Compra 1</p>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-[var(--label-secondary)] w-20 shrink-0">Qtd. Compra</span>
                    <span className="text-[13px] font-bold tabnum text-[var(--label-primary)]">{row.qtd_compra1 ? Math.round(Number(row.qtd_compra1)) : "—"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-[var(--label-secondary)] w-20 shrink-0">Pedido</span>
                    <span className="text-[13px] font-semibold text-[var(--label-primary)]">{row.pedido1 || "—"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-[var(--label-secondary)] w-20 shrink-0">Entrega</span>
                    <span className="text-[13px] font-semibold text-[var(--label-primary)]">{row.data_entrega1 ? String(row.data_entrega1).split("-").reverse().join("/") : "—"}</span>
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--label-tertiary)] mb-3">Compra 2</p>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-[var(--label-secondary)] w-20 shrink-0">Qtd. Compra</span>
                    <span className="text-[13px] font-bold tabnum text-[var(--label-primary)]">{row.qtd_compra2 ? Math.round(Number(row.qtd_compra2)) : "—"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-[var(--label-secondary)] w-20 shrink-0">Pedido</span>
                    <span className="text-[13px] font-semibold text-[var(--label-primary)]">{row.pedido2 || "—"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-[var(--label-secondary)] w-20 shrink-0">Entrega</span>
                    <span className="text-[13px] font-semibold text-[var(--label-primary)]">{row.data_entrega2 ? String(row.data_entrega2).split("-").reverse().join("/") : "—"}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ borderTop: `2px solid ${fichaColor}` }} className="pt-5">
            <div style={{ background: fichaColor }} className="text-white rounded-xl px-5 py-3 flex items-center justify-between mb-4"><span className="text-[13px] font-bold">AVIAMENTAÇÃO</span></div>
            <div className="mb-3 rounded-xl border border-[var(--separator)]" style={{ maxHeight: "420px", overflowX: "auto", overflowY: "auto" }}><table className="plm-table" style={{ minWidth: "max-content" }}><thead className="sticky top-0 z-10 bg-[var(--bg-secondary)]"><tr>
              <th className="w-8 px-1"></th>
              <th className="text-center w-8 px-2">#</th>
              <th className="w-28">Código</th>
              <th className="px-4">Matéria prima</th>
              <th className="min-w-[120px]">Fornecedor</th>
              <th className="w-32">Cód. forn.</th>
              <th className="text-center w-12">Qtd</th>
              <th className="text-right w-16">Valor</th>
              <th className="min-w-[200px]">Localização</th>
              {Array.from({length: numVars}, (_, i) => { const cor = tec[0]?.cores?.[i]; const pal = cor ? COR_PALETTE[cor] : null; return (<th key={i} className="text-center w-24"><div>Var {String(i+1).padStart(2,"0")}</div>{cor && <div className="mt-1 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold" style={pal ? { background: pal.bg, color: pal.text } : { background: "var(--bg-tertiary)", color: "var(--label-secondary)" }}>{cor}</div>}</th>); })}
            </tr></thead><tbody className="overflow-y-auto">{avi.map((a: any, i: number) => (
              <tr key={i}>
                <td className="px-1 py-1 text-center">
                  <button onClick={() => ra(i)} className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--label-quaternary)] hover:bg-red-50 hover:text-red-500 transition-colors" title="Remover">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </td>
                <td className="text-center text-[11px] font-bold text-[var(--label-tertiary)] px-2">{String(i+1).padStart(2,"0")}</td>
                <td className="font-mono text-[14px] font-bold px-4">{a.cod}</td>
                <td className="font-medium px-4">{a.item}</td>
                <td className="text-[12px] text-[var(--label-secondary)] px-4">{a.fornecedor || "—"}</td>
                <td className="font-mono text-[12px] text-[var(--label-tertiary)] px-4">{a.codigo_fornecedor || "—"}</td>
                <td className="text-center px-1"><input type="number" value={a.qtd} onChange={e => ua(i, "qtd", parseInt(e.target.value) || 1)} className="w-11 text-center text-[13px] border border-[var(--separator-opaque)] rounded-md px-1 py-1 outline-none" /></td>
                <td className="text-right tabnum">{a.valor > 0 ? a.valor.toFixed(2) : "—"}</td>
                <td className="px-1 py-1"><textarea value={a.local} onChange={e => ua(i, "local", e.target.value)} rows={2} className="w-full text-[12px] border border-[var(--separator-opaque)] rounded-lg px-2.5 py-1.5 outline-none resize-none leading-tight" placeholder="Localização..." /></td>
                {(["var01", "var02", "var03", "var04", "var05", "var06"] as const).slice(0, numVars).map(k => { const av = a[k] || ""; const pal = av ? COR_PALETTE[av] : null; return (<td key={k} className="px-1 py-1"><select value={av} onChange={e => ua(i, k, e.target.value)} className="w-full text-[11px] rounded-md px-1.5 py-1 outline-none border font-bold" style={pal ? { background: pal.bg, color: pal.text, borderColor: pal.bg } : { borderColor: "var(--separator-opaque)", color: "var(--label-quaternary)" }}><option value="">—</option>{(a.cores_disponiveis?.length ? a.cores_disponiveis : corOpts).map((c:string) => <option key={c} value={c}>{c}</option>)}</select></td>); })}
              </tr>
            ))}{avi.length > 0 && <tr className="border-t border-[var(--separator-opaque)]"><td /><td colSpan={4} className="px-4 py-2.5 font-bold">Total</td><td className="text-right tabnum font-bold py-2.5">R$ {avT.toFixed(2)}</td><td colSpan={numVars + 1} /></tr>}</tbody></table></div>

            {/* ── Galeria de imagens dos aviamentos ──
                 Itens com foto por cor (cores_disponiveis > 1) mostram só as
                 cores realmente escolhidas nas variantes desta ficha — não
                 todas as cores disponíveis no cadastro. */}
            {avi.some((a: any) => fotosParaExibir(a, numVars).length > 0) && (
              <div className="apple-card p-4 mb-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--label-tertiary)] mb-3">Referência Visual</div>
                <div className="flex flex-wrap gap-4">
                  {avi.flatMap((a: any, i: number) => fotosParaExibir(a, numVars).map(f => (
                    <div key={`${i}-${f.key}`} className="flex flex-col items-center gap-1.5" style={{ width: "280px" }}>
                      <div className="relative w-full">
                        <span className="absolute -top-2 -left-2 z-10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm" style={{ background: fichaColor }}>{String(i+1).padStart(2,"0")}</span>
                        <img src={f.url} alt={a.item} className="w-full aspect-square object-contain rounded-xl border border-[var(--separator)] bg-white p-2.5"/>
                      </div>
                      <p className="text-[13px] font-mono font-bold text-center leading-tight w-full">{a.cod}</p>
                      <p className="text-[9px] text-[var(--label-tertiary)] text-center leading-tight line-clamp-2 w-full">{a.item}{f.cor ? ` — ${f.cor}` : ""}</p>
                    </div>
                  )))}
                </div>
              </div>
            )}
            {!sap ? <button onClick={() => setSap(true)} className="apple-btn-secondary mb-4">+ Adicionar aviamento</button> : (
              <div className="apple-card p-3.5 mb-4 bg-[rgba(0,122,255,0.03)] border-[var(--system-blue)]"><div className="flex gap-2 mb-2"><input type="text" value={asq} onChange={e => setAsq(e.target.value)} placeholder="Buscar aviamento..." className="apple-input flex-1" autoFocus /><button onClick={() => { setSap(false); setAsq(""); }} className="text-[13px] text-[var(--label-secondary)] px-2">Cancelar</button></div><div className="max-h-[240px] overflow-y-auto overscroll-y-contain border border-[var(--separator-opaque)] rounded-xl bg-[var(--bg-primary)]">{fa.map((a: any) => (
                <button key={a.cod} onClick={() => aa(a)} className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-[var(--bg-secondary)] border-b border-[var(--separator)] flex items-center gap-3">
                  {a.imagem ? <img src={a.imagem} alt={a.nome} className="w-8 h-8 object-contain rounded border border-[var(--separator)] flex-shrink-0"/> : <div className="w-8 h-8 rounded border border-dashed border-[var(--separator-opaque)] flex-shrink-0 flex items-center justify-center text-[var(--label-quaternary)]"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>}
                  <div className="flex-1 min-w-0">
                    <div><span className="font-mono text-[11px] text-[var(--label-tertiary)] mr-2">{a.cod}</span><span className="font-medium">{a.nome}</span></div>
                    {a.localizacao_padrao && <div className="text-[11px] text-[var(--label-secondary)] truncate">{a.localizacao_padrao}</div>}
                  </div>
                  <span className="tabnum text-[var(--label-secondary)] flex-shrink-0">{a.preco > 0 ? `R$ ${a.preco.toFixed(2)}` : "—"}</span>
                </button>
              ))}</div></div>
            )}
          </div>

          {/* ── Custo Detalhado ── */}
          <div className="apple-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-tertiary)] mb-3">Detalhamento de Custo</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--label-secondary)] mb-2">Mão de Obra</div>
                <table className="w-full text-[12px]">
                  <tbody>
                    <tr className="border-b border-[var(--separator)]">
                      <td className="py-1.5 text-[var(--label-secondary)]">M.P.</td>
                      <td className="py-1.5 text-right"><input type="text" value={custoDet.mp} onChange={e => setCustoDet(p => ({ ...p, mp: e.target.value }))} placeholder="R$ —" className="w-24 text-right text-[12px] tabnum border border-[var(--separator-opaque)] rounded-lg px-2 py-1 outline-none focus:border-[var(--system-blue)]" /></td>
                    </tr>
                    <tr className="border-b border-[var(--separator)]">
                      <td className="py-1.5 text-[var(--label-secondary)]">M.O.</td>
                      <td className="py-1.5 text-right"><input type="text" value={custoDet.mo} onChange={e => setCustoDet(p => ({ ...p, mo: e.target.value }))} placeholder="R$ —" className="w-24 text-right text-[12px] tabnum border border-[var(--separator-opaque)] rounded-lg px-2 py-1 outline-none focus:border-[var(--system-blue)]" /></td>
                    </tr>
                    <tr className="border-b border-[var(--separator)]">
                      <td className="py-1.5 text-[var(--label-secondary)]">Avios.</td>
                      <td className="py-1.5 text-right tabnum text-[var(--label-secondary)]">R$ {avT.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 font-bold">Total M.O.</td>
                      <td className="py-1.5 text-right tabnum font-bold">
                        {(() => { const mp = parseFloat(custoDet.mp.replace(",",".")) || 0; const mo = parseFloat(custoDet.mo.replace(",",".")) || 0; return `R$ ${(mp + mo + avT).toFixed(2)}`; })()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--label-secondary)] mb-2">Produto Acabado</div>
                <table className="w-full text-[12px]">
                  <tbody>
                    <tr className="border-b border-[var(--separator)]">
                      <td className="py-1.5 text-[var(--label-secondary)]">Custo Forn.</td>
                      <td className="py-1.5 text-right tabnum text-[var(--label-secondary)]">{row.custo_forn ? `R$ ${Number(row.custo_forn).toFixed(2)}` : "—"}</td>
                    </tr>
                    <tr className="border-b border-[var(--separator)]">
                      <td className="py-1.5 text-[var(--label-secondary)]">Avios.</td>
                      <td className="py-1.5 text-right tabnum text-[var(--label-secondary)]">R$ {avT.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 font-bold">Total P.A.</td>
                      <td className="py-1.5 text-right tabnum font-bold">
                        {row.custo_forn ? `R$ ${(Number(row.custo_forn) + avT).toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--label-secondary)] mb-1.5">Observações de fechamento de custo</div>
              <textarea value={obsCusto} onChange={e => setObsCusto(e.target.value)} placeholder="Observações sobre o fechamento de custo..." rows={2} className="apple-input w-full resize-none text-[12px]" />
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)] mb-2">Observações</div>
            <textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Observações técnicas, instruções especiais..." rows={3} className="apple-input w-full resize-none" />
          </div>
        </div>)}

        {/* ═══ ESTAMPARIA ═══ */}
        {tab === "estamparia" && (<div className="px-3 sm:px-6 py-4 sm:py-6 space-y-5">
          {/* Header */}
          <div style={{ background: fichaColor }} className="text-white rounded-xl px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-bold">FICHA TECNICA DE ESTAMPARIA</span>
            <span className="text-[11px] font-semibold bg-white/15 px-3 py-0.5 rounded-full whitespace-nowrap">{(s => s.includes("REPILOTANDO") ? "REPILOTANDO PRODUÇÃO" : s.includes("PRODUÇÃO") || s.includes("PRODUCAO") ? "PRODUÇÃO" : s.includes("MOSTRUÁRIO") || s.includes("MOSTRUARIO") ? "MOSTRUÁRIO" : s.includes("CANCELADO") ? "CANCELADO" : "DESENVOLVIMENTO")((row.status || "").toUpperCase())}</span>
            <span className="text-[12px]"><span className="text-white/50">Coleção</span> <span className="font-semibold ml-1">{row.colecao}</span></span>
          </div>

          {/* Product info */}
          <div className="apple-card">
            <div className="grid grid-cols-1 sm:grid-cols-2">{([["Referência", row.ref], ["Descrição", row.desc], ["Operação", row.operacao], ["Fornecedor", row.fornecedor], ["Estilista", row.estilista], ["Grade", row.grade], ["Drop", row.drop], ["Tecido", row.tecido]] as [string, any][]).map(([l, v]) => <F key={l} l={l} v={v} />)}</div>
          </div>

          {/* Artes: FRENTE + COSTAS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {(estamparia.artes || []).filter((a: any) => a.posicao !== "TAGLESS").map((arte: any) => (
              <div key={arte.posicao} className="space-y-2.5">
                <div style={{ background: fichaColor }} className="text-white rounded-lg px-4 py-2 text-center"><span className="text-[12px] font-bold tracking-wide">ARTE {arte.posicao}</span></div>
                <div className={`apple-card bg-[var(--bg-secondary)] aspect-[4/3] flex items-center justify-center cursor-pointer hover:border-[var(--system-blue)] relative overflow-hidden transition-colors ${dragOver === `arte-${arte.posicao}` ? "border-[var(--system-blue)] bg-blue-50/40" : ""}`}
                  onClick={() => triggerEstImg("arte", arte.posicao)}
                  onDragOver={e => { e.preventDefault(); setDragOver(`arte-${arte.posicao}`); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => dropEstImg(e, "arte", arte.posicao)}>
                  {arte.imagem ? <img src={arte.imagem} alt={`Arte ${arte.posicao}`} className="w-full h-full object-contain p-3" /> : <div className="text-center"><svg className="mx-auto mb-2 text-[var(--label-quaternary)]" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg><p className="text-[13px] text-[var(--label-tertiary)]">Arrastar aqui ou clique</p></div>}
                  {arte.imagem && <button onClick={e => { e.stopPropagation(); deleteEstImg("arte", arte.posicao, arte.imagem); }} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                </div>
                <input type="text" value={arte.largura} onChange={e => updArte(arte.posicao, "largura", e.target.value)} placeholder="Ex: 34CM LARG." className="apple-input w-full text-[12px]" />
                <div style={{ background: fichaColor }} className="text-white rounded-lg px-4 py-2 text-center"><span className="text-[12px] font-bold tracking-wide">LOCALIZAÇÃO ARTE {arte.posicao}</span></div>
                <div className={`apple-card bg-[var(--bg-secondary)] aspect-[4/3] flex items-center justify-center cursor-pointer hover:border-[var(--system-blue)] relative overflow-hidden transition-colors ${dragOver === `local-${arte.posicao}` ? "border-[var(--system-blue)] bg-blue-50/40" : ""}`}
                  onClick={() => triggerEstImg("arteLocal", arte.posicao)}
                  onDragOver={e => { e.preventDefault(); setDragOver(`local-${arte.posicao}`); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => dropEstImg(e, "arteLocal", arte.posicao)}>
                  {arte.imagemLocal ? <img src={arte.imagemLocal} alt={`Localização ${arte.posicao}`} className="w-full h-full object-contain p-3" /> : <div className="text-center"><svg className="mx-auto mb-2 text-[var(--label-quaternary)]" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg><p className="text-[13px] text-[var(--label-tertiary)]">Arrastar aqui ou clique</p></div>}
                  {arte.imagemLocal && <button onClick={e => { e.stopPropagation(); deleteEstImg("arteLocal", arte.posicao, arte.imagemLocal); }} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                </div>
                <textarea value={arte.localizacao} onChange={e => updArte(arte.posicao, "localizacao", e.target.value)} placeholder="Descreva a localização da estampa..." rows={3} className="apple-input w-full resize-none text-[12px]" />
              </div>
            ))}
          </div>

          {/* TAGLESS */}
          {(() => { const tg = (estamparia.artes || []).find((a: any) => a.posicao === "TAGLESS"); if (!tg) return null; return (
            <div className="space-y-2.5">
              <div style={{ background: fichaColor }} className="text-white rounded-lg px-4 py-2 text-center"><span className="text-[12px] font-bold tracking-wide">TAGLESS</span></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className={`apple-card bg-[var(--bg-secondary)] aspect-[3/2] flex items-center justify-center cursor-pointer hover:border-[var(--system-blue)] relative overflow-hidden transition-colors ${dragOver === "arte-TAGLESS" ? "border-[var(--system-blue)] bg-blue-50/40" : ""}`}
                  onClick={() => triggerEstImg("arte", "TAGLESS")}
                  onDragOver={e => { e.preventDefault(); setDragOver("arte-TAGLESS"); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => dropEstImg(e, "arte", "TAGLESS")}>
                  {tg.imagem ? <img src={tg.imagem} alt="Tagless" className="w-full h-full object-contain p-3" /> : <div className="text-center"><svg className="mx-auto mb-2 text-[var(--label-quaternary)]" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg><p className="text-[13px] text-[var(--label-tertiary)]">Arrastar aqui ou clique</p></div>}
                  {tg.imagem && <button onClick={e => { e.stopPropagation(); deleteEstImg("arte", "TAGLESS", tg.imagem); }} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                </div>
                <div className="space-y-2">
                  <input type="text" value={tg.largura} onChange={e => updArte("TAGLESS", "largura", e.target.value)} placeholder="Ex: 5,5CM" className="apple-input w-full text-[12px]" />
                  <div style={{ background: fichaColor }} className="text-white rounded-lg px-4 py-2 text-center"><span className="text-[12px] font-bold tracking-wide">LOCALIZAÇÃO ARTE TAGLESS</span></div>
                  <div className={`apple-card bg-[var(--bg-secondary)] aspect-[3/2] flex items-center justify-center cursor-pointer hover:border-[var(--system-blue)] relative overflow-hidden transition-colors ${dragOver === "local-TAGLESS" ? "border-[var(--system-blue)] bg-blue-50/40" : ""}`}
                    onClick={() => triggerEstImg("arteLocal", "TAGLESS")}
                    onDragOver={e => { e.preventDefault(); setDragOver("local-TAGLESS"); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={e => dropEstImg(e, "arteLocal", "TAGLESS")}>
                    {tg.imagemLocal ? <img src={tg.imagemLocal} alt="Localização TAGLESS" className="w-full h-full object-contain p-3" /> : <div className="text-center"><svg className="mx-auto mb-2 text-[var(--label-quaternary)]" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg><p className="text-[13px] text-[var(--label-tertiary)]">Arrastar aqui ou clique</p></div>}
                    {tg.imagemLocal && <button onClick={e => { e.stopPropagation(); deleteEstImg("arteLocal", "TAGLESS", tg.imagemLocal); }} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                  </div>
                  <textarea value={tg.localizacao} onChange={e => updArte("TAGLESS", "localizacao", e.target.value)} placeholder="Ex: Tagless centralizado na parte interna das costas a 1,5cm do cobre gola" rows={3} className="apple-input w-full resize-none text-[12px]" />
                </div>
              </div>
            </div>
          ); })()}

          {/* Técnicas de Estamparia */}
          <div style={{ borderTop: `2px solid ${fichaColor}` }} className="pt-5">
            <div style={{ background: fichaColor }} className="text-white rounded-xl px-5 py-3 flex items-center justify-between mb-4"><span className="text-[13px] font-bold">TÉCNICA DE ESTAMPARIA</span></div>
            <div className="apple-card overflow-x-auto">
              <table className="plm-table">
                <thead><tr>
                  <th className="text-center w-10">#</th>
                  <th className="min-w-[180px]">Técnica de Estamparia</th>
                  {Array.from({length: numVars}, (_, i) => { const cor = tec[0]?.cores?.[i]; const pal = cor ? COR_PALETTE[cor] : null; return (<th key={i} className="text-center w-[110px]">Variante {String(i+1).padStart(2,"0")}{cor ? <div className="mt-1 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold" style={pal ? { background: pal.bg, color: pal.text } : { background: "var(--bg-tertiary)", color: "var(--label-secondary)" }}>{cor}</div> : null}</th>); })}
                  <th className="w-8"></th>
                </tr></thead>
                <tbody>{(estamparia.tecnicas || []).map((t: any, i: number) => (
                  <tr key={i}>
                    <td className="text-center font-bold text-[var(--label-secondary)]">{i + 1}</td>
                    <td className="px-1 py-1.5"><select value={t.tecnica} onChange={e => updTecnica(i, "tecnica", e.target.value)} className="w-full text-[12px] px-2 py-1.5 rounded-lg border border-[var(--separator-opaque)] outline-none focus:border-[var(--system-blue)]"><option value="">Selecionar técnica</option>{TECNICAS_OPTS.map(o => <option key={o} value={o}>{o}</option>)}</select></td>
                    {(["var01", "var02", "var03", "var04", "var05", "var06"] as const).slice(0, numVars).map(k => (
                      <td key={k} className="px-1 py-1.5"><input type="text" value={t[k] || ""} onChange={e => updTecnica(i, k, e.target.value)} placeholder="Cor / Pantone" className="w-full text-[12px] text-center px-2 py-1.5 rounded-lg border border-[var(--separator-opaque)] outline-none focus:border-[var(--system-blue)]" /></td>
                    ))}
                    <td className="text-center"><button onClick={() => removeTecnica(i)} className="text-[var(--label-quaternary)] hover:text-[var(--system-red)] text-[16px]">×</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <button onClick={addTecnica} className="apple-btn-secondary mt-3">+ Adicionar técnica</button>
          </div>

          {/* Simulações e Fotos por Variante */}
          <div style={{ borderTop: `2px solid ${fichaColor}` }} className="pt-5">
            <div style={{ background: fichaColor }} className="text-white rounded-xl px-5 py-3 flex items-center justify-between mb-4"><span className="text-[13px] font-bold">SIMULAÇÕES E FOTOS</span></div>
            <div className="space-y-5">
              {(["var01", "var02", "var03", "var04", "var05", "var06"] as const).slice(0, numVars).map((vk, vi) => {
                const corName = tec[0]?.cores?.[vi] || "";
                const sim = estamparia.simulacoes?.[vk] || { nome: "", imgSim: "", imgFoto: "", status: "" };
                return (
                  <div key={vk} className="apple-card p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-[14px] font-bold">Variante {String(vi + 1).padStart(2, "0")}</span>
                        {corName && (() => { const pal = COR_PALETTE[corName]; return <span className="text-[12px] font-bold px-3 py-0.5 rounded-full" style={pal ? { background: pal.bg, color: pal.text } : { background: "var(--bg-secondary)", color: "var(--label-secondary)" }}>{corName}</span>; })()}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {([
                          ["APROVADA IDEM PILOTO",             "Aprov. Idem Piloto",  "bg-[rgba(52,199,89,0.14)] text-[#248a3d] border-[rgba(52,199,89,0.25)]"],
                          ["LIBERADA DIRETO MOSTRUÁRIO",       "Liberada Direto",     "bg-[rgba(255,149,0,0.15)] text-[#9a5000] border-[rgba(255,149,0,0.35)]"],
                          ["APROVADA IDEM MOSTRUÁRIO",         "Aprov. Idem Mostr.",  "bg-[rgba(52,199,89,0.14)] text-[#248a3d] border-[rgba(52,199,89,0.25)]"],
                          ["COR NOVA - ENVIAR BANDEIRA",       "Cor Nova",            "bg-[rgba(255,149,0,0.15)] text-[#9a5000] border-[rgba(255,149,0,0.35)]"],
                          ["REPROVADA - ENVIAR BANDEIRA CORRIGIDA", "Reprovada",      "bg-[rgba(255,59,48,0.12)] text-[#d70015] border-[rgba(255,59,48,0.25)]"],
                        ] as [string, string, string][]).map(([val, label, cls]) => (
                          <button key={val} onClick={() => updSim(vk, "status", sim.status === val ? "" : val)} className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${sim.status === val ? cls : "border-[var(--separator-opaque)] text-[var(--label-quaternary)] bg-transparent hover:border-[var(--label-tertiary)]"}`}>{label}</button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)]">Simulação</div>
                        <div className={`apple-card bg-[var(--bg-secondary)] aspect-[4/3] flex items-center justify-center cursor-pointer hover:border-[var(--system-blue)] relative overflow-hidden transition-colors ${dragOver === `sim-${vk}` ? "border-[var(--system-blue)] bg-blue-50/40" : ""}`}
                          onClick={() => triggerEstImg("sim", vk)}
                          onDragOver={e => { e.preventDefault(); setDragOver(`sim-${vk}`); }}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={e => dropEstImg(e, "sim", vk)}>
                          {sim.imgSim ? <img src={sim.imgSim} alt={`Simulação ${vk}`} className="w-full h-full object-contain p-2" /> : <div className="text-center"><svg className="mx-auto mb-1 text-[var(--label-quaternary)]" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg><p className="text-[12px] text-[var(--label-tertiary)]">Arrastar ou clique</p></div>}
                          {sim.imgSim && <button onClick={e => { e.stopPropagation(); deleteEstImg("sim", vk, sim.imgSim); }} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)]">Foto</div>
                        <div className={`apple-card bg-[var(--bg-secondary)] aspect-[4/3] flex items-center justify-center cursor-pointer hover:border-[var(--system-blue)] relative overflow-hidden transition-colors ${dragOver === `foto-${vk}` ? "border-[var(--system-blue)] bg-blue-50/40" : ""}`}
                          onClick={() => triggerEstImg("foto", vk)}
                          onDragOver={e => { e.preventDefault(); setDragOver(`foto-${vk}`); }}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={e => dropEstImg(e, "foto", vk)}>
                          {sim.imgFoto ? <img src={sim.imgFoto} alt={`Foto ${vk}`} className="w-full h-full object-contain p-2" /> : <div className="text-center"><svg className="mx-auto mb-1 text-[var(--label-quaternary)]" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg><p className="text-[12px] text-[var(--label-tertiary)]">Arrastar ou clique</p></div>}
                          {sim.imgFoto && <button onClick={e => { e.stopPropagation(); deleteEstImg("foto", vk, sim.imgFoto); }} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Observações */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)] mb-2">Observações</div>
            <textarea value={estamparia.observacoes || ""} onChange={e => setEstamparia((prev: any) => ({ ...prev, observacoes: e.target.value }))} placeholder="Observações de estamparia..." rows={3} className="apple-input w-full resize-none" />
          </div>

          {/* Hidden file input for estamparia uploads */}
          <input ref={estImgRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleEstImg} />
        </div>)}

        {/* ═══ LIBERAÇÃO ═══ */}
        {tab === "liberacao" && (<div className="px-3 sm:px-6 py-4 sm:py-6 space-y-5">
          <div style={{ background: modelagemColor }} className="text-white rounded-xl px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2"><span className="text-[13px] font-bold">TABELA DE MEDIDAS — LIBERAÇÃO DE {_s.includes('PRODUÇÃO') || _s.includes('PRODUCAO') ? 'PRODUÇÃO' : _s.includes('MOSTRUÁRIO') || _s.includes('MOSTRUARIO') ? 'MOSTRUÁRIO' : 'DESENVOLVIMENTO'}</span><span className="text-[12px]"><span className="text-white/50">Coleção</span> <span className="font-semibold ml-1">{row.colecao}</span></span></div>
          <div className="apple-card"><div className="grid grid-cols-1 sm:grid-cols-2">{([["Referência", row.ref], ["Descrição", row.desc], ["Tabela base", tm], ["Tamanho", gradBase || "—"], ["Tecido", row.tecido], ["Fornecedor", row.fornecedor], ["Estilista", row.estilista], ["Grade", row.grade]] as [string, any][]).map(([l, v]) => <F key={l} l={l} v={v} />)}</div></div>

          {/* Foto do produto — frente e costas lado a lado */}
          <div className="apple-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)] mb-3">Foto do produto</div>
            <input ref={frenteRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => hi(e, "imagem_frente", setImgFrente, imgFrente)} />
            <input ref={costasRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => hi(e, "imagem_costas", setImgCostas, imgCostas)} />
            <div className="grid grid-cols-2 gap-4">
              {([["Frente", imgFrente, setImgFrente, frenteRef, "imagem_frente"], ["Costas", imgCostas, setImgCostas, costasRef, "imagem_costas"]] as [string, string|null, (v:any)=>void, any, string][]).map(([lbl, url, setter, ref, field]) => (
                <div key={field}>
                  <div className="text-[11px] font-medium text-[var(--label-tertiary)] mb-1.5 text-center">{lbl}</div>
                  <div onClick={() => ref.current?.click()} className="relative border border-[var(--separator)] rounded-xl overflow-hidden cursor-pointer hover:border-[var(--system-blue)] transition-colors aspect-[3/4] flex items-center justify-center bg-[var(--bg-secondary)]">
                    {url
                      ? <img src={url} alt={lbl} className="w-full h-full object-contain" />
                      : <div className="text-center text-[var(--label-quaternary)]"><svg className="mx-auto mb-1" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg><span className="text-[11px]">Adicionar foto</span></div>}
                    {url && <button onClick={e => { e.stopPropagation(); setter(null); if (fichaId) saveFichaImagem(fichaId, field, ""); }} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center" title="Remover"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="apple-card px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)]">Status da liberação</span>
            <div className="flex flex-wrap gap-2">
              {([
                ["AGUARDANDO PROVA",       "Aguardando prova",    "bg-[rgba(68,100,175,0.12)] text-[#4464AF] border-[rgba(68,100,175,0.3)]"],
                ["REPROVADO",              "Reprovado",           "bg-[rgba(255,59,48,0.12)] text-[#d70015] border-[rgba(255,59,48,0.25)]"],
                ["APROVADO COM RESTRIÇÃO", "Aprov. c/ restrição", "bg-[rgba(255,204,0,0.18)] text-[#856500]  border-[rgba(255,204,0,0.35)]"],
                ["APROVADO",              "Aprovado",            "bg-[rgba(52,199,89,0.14)] text-[#248a3d] border-[rgba(52,199,89,0.25)]"],
              ] as [string, string, string][]).map(([val, label, cls]) => (
                <button key={val} onClick={() => setStatusLib(prev => prev === val ? "" : val)}
                  className={`px-3.5 py-1 rounded-full text-[12px] font-semibold border transition-all ${statusLib === val ? cls : "border-[var(--separator-opaque)] text-[var(--label-quaternary)] bg-transparent hover:border-[var(--label-tertiary)]"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {!tm ? <div className="apple-card p-16 text-center"><p className="text-[16px] font-medium text-[var(--label-secondary)]">Nenhuma tabela selecionada</p></div> : (<>

            {/* Toggle tabela especial */}
            <div className="apple-card px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)]">Tabela de medidas</span>
                {tEsp && <span className="text-[10px] font-bold uppercase tracking-[0.06em] px-2.5 py-0.5 rounded-full bg-[rgba(255,159,10,0.14)] text-[#c77c00]">Especial</span>}
              </div>
              <button onClick={toggleEsp} className={`px-3.5 py-1 rounded-full text-[12px] font-semibold border transition-all ${tEsp ? "bg-[rgba(255,159,10,0.14)] text-[#c77c00] border-[rgba(255,159,10,0.3)]" : "border-[var(--separator-opaque)] text-[var(--label-tertiary)] hover:border-[var(--label-secondary)]"}`}>
                {tEsp ? "Desativar especial" : "Ativar tabela especial"}
              </button>
            </div>

            {/* Tabela de medidas (pontos) */}
            <div className="apple-card overflow-x-auto"><table className="plm-table"><thead>
              {/* Linha 1: labels PROVA */}
              <tr>
                <th colSpan={3} className="border-b-0" />
                {(["p1","p2","p3"] as const).map((pk, pi) => {
                  const info = provaInfo[pk] || { data: "", status: "" };
                  const st = info.status;
                  const isBlue = pi === 0;
                  const stBg = st === "REPROVADO" ? "rgba(234,47,70,0.10)" : st === "LIBERADO" ? "rgba(45,181,100,0.10)" : st === "LIBERADO C/ RESTRIÇÃO" ? "rgba(237,202,53,0.12)" : "rgba(68,100,175,0.08)";
                  const stColor = st === "REPROVADO" ? "#EA2F46" : st === "LIBERADO" ? "#2DB564" : st === "LIBERADO C/ RESTRIÇÃO" ? "#7A5C00" : "#4464AF";
                  const stBorder = st === "REPROVADO" ? "rgba(234,47,70,0.35)" : st === "LIBERADO" ? "rgba(45,181,100,0.35)" : st === "LIBERADO C/ RESTRIÇÃO" ? "rgba(237,202,53,0.5)" : "rgba(68,100,175,0.3)";
                  return (
                    <th key={pk} colSpan={2} className={`border-b border-l border-[var(--separator-opaque)] py-0 !font-semibold text-[11px] tracking-[0.06em] uppercase ${isBlue ? "!text-[var(--system-blue)] !bg-[rgba(0,122,255,0.04)] border-blue-100" : "text-[var(--label-secondary)]"}`}>
                      <div className="flex flex-col items-center gap-1.5 px-3 py-2.5">
                        <span className="text-[11px] font-bold tracking-[0.08em]">Prova {pi + 1}</span>
                        <input
                          type="text"
                          value={dataProvaDraft[pk] ?? (info.data ? info.data.split('-').reverse().join('/') : "")}
                          onChange={e => {
                            // aceita DD/MM/AAAA e converte para YYYY-MM-DD internamente
                            const raw = e.target.value.replace(/\D/g, '').slice(0, 8);
                            let display = raw;
                            if (raw.length > 4) display = raw.slice(0, 2) + '/' + raw.slice(2, 4) + '/' + raw.slice(4);
                            else if (raw.length > 2) display = raw.slice(0, 2) + '/' + raw.slice(2);
                            setDataProvaDraft(prev => ({ ...prev, [pk]: display }));
                            const iso = raw.length === 8 ? `${raw.slice(4)}-${raw.slice(2, 4)}-${raw.slice(0, 2)}` : "";
                            setProvaInfo(prev => ({ ...prev, [pk]: { ...info, data: iso } }));
                          }}
                          // Ao sair do campo, descarta o rascunho: volta a exibir o que foi
                          // efetivamente salvo (data incompleta não é guardada).
                          onBlur={() => setDataProvaDraft(prev => { const n = { ...prev }; delete n[pk]; return n; })}
                          placeholder="DD/MM/AAAA"
                          className="w-full text-[11px] tabnum border border-[var(--separator-opaque)] rounded-lg px-2 py-1.5 outline-none focus:border-[var(--system-blue)] text-center bg-[var(--bg-primary)] font-normal"
                        />
                        <select
                          value={st}
                          onChange={e => setProvaInfo(prev => ({ ...prev, [pk]: { ...info, status: e.target.value } }))}
                          style={{ background: stBg, color: stColor, borderColor: stBorder }}
                          className="w-full text-[11px] font-semibold rounded-lg px-2 py-1.5 outline-none border cursor-pointer"
                        >
                          <option value="">Status...</option>
                          <option value="AGUARDANDO PROVA">Aguardando prova</option>
                          <option value="LIBERADO">Liberado</option>
                          <option value="LIBERADO C/ RESTRIÇÃO">Liberado c/ restrição</option>
                          <option value="REPROVADO">Reprovado</option>
                        </select>
                        <select
                          value={(info as any).tipo || ""}
                          onChange={e => setProvaInfo(prev => ({ ...prev, [pk]: { ...info, tipo: e.target.value } }))}
                          className="w-full text-[11px] rounded-lg px-2 py-1.5 outline-none border border-[var(--separator-opaque)] cursor-pointer bg-[var(--bg-primary)] text-[var(--label-primary)]"
                        >
                          <option value="">Tipo de prova...</option>
                          <option value="MOSTRUÁRIO">Mostruário</option>
                          <option value="PRODUÇÃO">Produção</option>
                        </select>
                        <input
                          type="url"
                          value={info.link || ""}
                          onChange={e => setProvaInfo(prev => ({ ...prev, [pk]: { ...info, link: e.target.value } }))}
                          placeholder="Link vídeo..."
                          className="w-full text-[10px] border border-[var(--separator-opaque)] rounded-lg px-2 py-1.5 outline-none focus:border-[var(--system-blue)] bg-[var(--bg-primary)] font-normal"
                        />
                      </div>
                    </th>
                  );
                })}
                <th className="border-b-0" />
              </tr>
              {/* Linha 2: sub-cabeçalhos de coluna */}
              <tr>
                <th className="text-center w-12">Cód</th>
                <th>Descrição</th>
                <th className="text-center w-16">{tEsp ? <span className="text-[var(--system-orange)]">Tabela{gradBase ? ` (tam. ${gradBase})` : ""}</span> : `Tabela${gradBase ? ` (tam. ${gradBase})` : ""}`}</th>
                <th className="text-center w-24 !bg-[rgba(0,122,255,0.04)] !text-[var(--system-blue)] border-l border-[var(--separator-opaque)]">Medida</th>
                <th className="text-center w-24 !bg-[rgba(0,122,255,0.04)] !text-[var(--system-blue)]">Diferença</th>
                <th className="text-center w-24 border-l border-[var(--separator-opaque)]">Medida</th><th className="text-center w-24">Diferença</th>
                <th className="text-center w-24 border-l border-[var(--separator-opaque)]">Medida</th><th className="text-center w-24">Diferença</th>
                <th className="text-center w-28 border-l border-[var(--separator-opaque)]">Tolerância</th>
              </tr>
            </thead><tbody>{ptsAtivo.map((p: any, pi: number) => { const v = pv[p.cod] || { p1: "", p2: "", p3: "" }; return (<tr key={p.cod}>
              <td className="text-center font-bold text-[var(--label-secondary)] px-3">{p.cod}</td>
              <td className="font-medium px-3">{p.desc}</td>
              <td className={`text-center tabnum font-semibold px-1 ${tEsp ? "bg-[rgba(255,159,10,0.04)]" : ""}`}>{tEsp
                ? <input type="text" value={p.tabela} onChange={e => updPtsEsp(pi, "tabela", e.target.value)} className="w-14 text-center text-[13px] tabnum border border-[rgba(255,159,10,0.4)] rounded-md px-1 py-1 outline-none focus:border-[var(--system-orange)] bg-[rgba(255,159,10,0.04)]" />
                : p.tabela
              }</td>
              {(["p1", "p2", "p3"] as const).map(pk => { const val = v[pk]; const d = gd(p.tabela, val); const cl = gc(p.tabela, val); return [<td key={pk} className={`px-1 py-1 border-l border-[var(--separator-opaque)] ${pk === "p1" ? "bg-[rgba(0,122,255,0.02)]" : ""}`}><input id={`ficha-prova-${pk}-${pi}`} type="text" value={val} onChange={e => { setPv(prev => ({ ...prev, [p.cod]: { ...v, [pk]: e.target.value } })); }} onKeyDown={e => focusCampoAbaixo(e, `ficha-prova-${pk}-${pi + 1}`)} className="w-14 text-center text-[13px] tabnum border border-[var(--separator-opaque)] rounded-md px-1 py-1 outline-none focus:border-[var(--system-blue)]" placeholder="—" /></td>, <td key={pk + "d"} className={`text-center tabnum text-[12px] ${cl} ${!cl && pk === "p1" ? "bg-[rgba(0,122,255,0.02)]" : ""}`}>{d || "—"}</td>]; })}
              <td className="text-center text-[12px] text-[var(--label-secondary)] px-2 border-l border-[var(--separator-opaque)]">{p.tol}</td>
            </tr>); })}</tbody></table></div>

            {/* Graduação — só para produção aprovada */}
            {gradAtivo.length > 0 && isProd && (statusLib === "APROVADO" || statusLib === "APROVADO COM RESTRIÇÃO") && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)]">Graduação — {tEsp ? "Especial" : tm}{row.grade ? ` · grade ${row.grade}` : ""}</span>
                  {tEsp && <span className="text-[10px] text-[var(--system-orange)]">Edite {gradBase} — os outros tamanhos são calculados</span>}
                </div>
                <div className="apple-card overflow-hidden overflow-x-auto">
                  <table className="plm-table">
                    <thead><tr>
                      <th>Descrição</th>
                      {gradTamanhos.map(t => (
                        <th key={t} className={`text-center w-16 ${t === gradBase ? "!bg-[rgba(0,122,255,0.06)] !text-[var(--system-blue)]" : ""}`}>{t}</th>
                      ))}
                      <th className="text-center w-24">Tolerância</th>
                    </tr></thead>
                    <tbody>{gradAtivo.map((g: any, i: number) => (
                      <tr key={i}>
                        <td className="font-medium px-3">{g.desc}</td>
                        {gradTamanhos.map(t => (
                          t === gradBase ? (
                            <td key={t} className={`text-center tabnum font-bold px-1 ${tEsp ? "bg-[rgba(255,159,10,0.04)]" : "bg-[rgba(0,122,255,0.03)]"}`}>{tEsp
                              ? <input type="text" value={g.valores?.[t] ?? ""} onChange={e => updMedidaEsp(i, e.target.value)} className="w-14 text-center text-[13px] tabnum font-bold border border-[rgba(255,159,10,0.4)] rounded-md px-1 py-1 outline-none focus:border-[var(--system-orange)] bg-[rgba(255,159,10,0.04)]" />
                              : valorGrad(g, t)
                            }</td>
                          ) : (
                            <td key={t} className="text-center tabnum px-2" style={tEsp ? { background: "rgba(0,122,255,0.02)", color: "var(--label-tertiary)" } : {}}>{valorGrad(g, t)}</td>
                          )
                        ))}
                        <td className="text-center text-[12px] text-[var(--label-secondary)] px-2">{g.tol}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <p className="text-[11px] text-[var(--label-tertiary)] mt-2">{tEsp ? `Especial desta ficha: os demais tamanhos seguem as ampliações da tabela ${tm || "original"}, deslocadas pela medida de ${gradBase} que você informou. As tabelas do cadastro não são alteradas.` : `Tamanhos exibidos conforme a grade do produto. Base: ${gradBase}.`}</p>
              </div>
            )}
            {/* Fotos das Provas — 3 por prova */}
            {(() => {
              const sides: { key: "fotoFrente"|"fotoLado"|"fotoCostas"; label: string; side: "frente"|"lado"|"costas" }[] = [
                { key: "fotoFrente", label: "Frente", side: "frente" },
                { key: "fotoLado",   label: "Lado",   side: "lado"   },
                { key: "fotoCostas", label: "Costas", side: "costas" },
              ];
              return (
                <div className="apple-card p-4 space-y-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)]">Fotos das Provas</div>
                  {(["p1","p2","p3"] as const).map((pk, pi) => {
                    const info = provaInfo[pk] || {};
                    const hasAny = (info as any).fotoFrente || (info as any).fotoLado || (info as any).fotoCostas;
                    return (
                      <div key={pk}>
                        <div className="text-[11px] font-bold text-[var(--label-tertiary)] mb-2">Prova {pi+1}{provaInfo[pk]?.data ? ` — ${provaInfo[pk].data.split('-').reverse().join('/')}` : ""}</div>
                        <div className="grid grid-cols-3 gap-3">
                          {sides.map(({ key, label, side }) => {
                            const url = (info as any)[key] || "";
                            const dragKey = `${pk}_${side}`;
                            const isDragging = dragOver === dragKey;
                            return (
                              <div key={side} className="space-y-1">
                                <div className="text-[10px] font-semibold text-center text-[var(--label-tertiary)] uppercase tracking-[0.05em]">{label}</div>
                                <div
                                  className={`apple-card bg-[var(--bg-secondary)] aspect-square flex items-center justify-center cursor-pointer overflow-hidden relative transition-all ${isDragging ? "border-[var(--system-blue)] bg-[rgba(0,122,255,0.06)]" : "hover:border-[var(--system-blue)]"}`}
                                  onClick={() => { setFotoProvaTarget({ prova: pk, side }); fotoProvaRef.current?.click(); }}
                                  onDragOver={e => { e.preventDefault(); setDragOver(dragKey); }}
                                  onDragLeave={() => setDragOver(null)}
                                  onDrop={e => handleDropProva(e, pk, side)}
                                >
                                  {url ? (
                                    <>
                                      <img src={url} alt={`Prova ${pi+1} ${label}`} className="w-full h-full object-cover" />
                                      <button onClick={e => { e.stopPropagation(); setProvaInfo(prev => ({ ...prev, [pk]: { ...prev[pk], [key]: "" } })); }} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center">
                                        <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                      </button>
                                    </>
                                  ) : (
                                    <div className="text-center p-2">
                                      <svg className="mx-auto mb-1 text-[var(--label-quaternary)]" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                                      <p className="text-[9px] text-[var(--label-quaternary)] leading-tight">Clique ou<br/>arraste</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Modo de medir — vem da tabela de medidas, somente leitura */}
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)] mb-1.5">
                Modo de medir
                {row.tab_medidas && <span className="ml-1.5 font-normal normal-case text-[var(--label-tertiary)]">— {row.tab_medidas}</span>}
              </div>
              <div className="apple-card bg-[var(--bg-secondary)] flex items-center justify-center overflow-hidden min-h-[120px]">
                {imgModoMedir
                  ? <img src={imgModoMedir} alt="Modo de medir" className="w-full object-contain p-2" />
                  : <div className="text-center py-6">
                      <svg className="mx-auto mb-1 text-[var(--label-quaternary)]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                      <p className="text-[11px] text-[var(--label-tertiary)]">
                        {row.tab_medidas ? "Adicione a imagem na aba Medidas" : "Produto sem tabela de medidas"}
                      </p>
                    </div>}
              </div>
            </div>

            {/* Modelo — Frente e Costas da última prova */}
            {(() => {
              const frenteAuto = provaInfo.p3?.fotoFrente || provaInfo.p2?.fotoFrente || provaInfo.p1?.fotoFrente || null;
              const costasAuto = provaInfo.p3?.fotoCostas || provaInfo.p2?.fotoCostas || provaInfo.p1?.fotoCostas || null;
              const isAuto = !imgModelo && (frenteAuto || costasAuto);
              return (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)] mb-2">
                    Modelo
                    {isAuto && <span className="ml-2 text-[10px] font-normal text-[var(--label-tertiary)] normal-case">(da última prova)</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Frente */}
                    <div className="space-y-1">
                      <div className="text-[10px] font-semibold text-center text-[var(--label-tertiary)] uppercase tracking-[0.05em]">Frente</div>
                      <div className="apple-card bg-[var(--bg-secondary)] aspect-[3/4] flex items-center justify-center overflow-hidden">
                        {frenteAuto
                          ? <img src={frenteAuto} alt="Modelo Frente" className="w-full h-full object-contain p-1" />
                          : <div className="text-center"><svg className="mx-auto mb-1 text-[var(--label-quaternary)]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg><p className="text-[10px] text-[var(--label-quaternary)]">Sem foto</p></div>
                        }
                      </div>
                    </div>
                    {/* Costas */}
                    <div className="space-y-1">
                      <div className="text-[10px] font-semibold text-center text-[var(--label-tertiary)] uppercase tracking-[0.05em]">Costas</div>
                      <div className="apple-card bg-[var(--bg-secondary)] aspect-[3/4] flex items-center justify-center overflow-hidden">
                        {costasAuto
                          ? <img src={costasAuto} alt="Modelo Costas" className="w-full h-full object-contain p-1" />
                          : <div className="text-center"><svg className="mx-auto mb-1 text-[var(--label-quaternary)]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg><p className="text-[10px] text-[var(--label-quaternary)]">Sem foto</p></div>
                        }
                      </div>
                    </div>
                  </div>
                  <input ref={mrr} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => hi(e, "imagem_modelo", setImgModelo, imgModelo)} />
                </div>
              );
            })()}
            <div className="space-y-3">{([1, 2, 3] as const).map(n => {
              const k = `p${n}` as "p1" | "p2" | "p3";
              const a = an[k] || { texto: "", video: "" };
              const pilRow = pil[n - 1] || { num: "", lacre: "", envio: "", receb: "", prova: "", status: "" };
              const bullets: string[] = a.texto ? a.texto.split('\n') : [""];
              const piStatus = provaInfo[k]?.status || "";
              const statusColor = piStatus.includes("REPROV") ? "text-[var(--system-red)]" : piStatus.includes("RESTR") ? "text-[var(--system-orange)]" : piStatus.includes("APROV") || piStatus.includes("LIBER") ? "text-[var(--system-green)]" : "text-[var(--label-secondary)]";
              return (
                <div key={n} className="apple-card p-4">
                  {/* Cabeçalho: Prova N + tipo */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)] shrink-0">Prova {n}</div>
                    <select value={pilRow.num || ""} onChange={e => setPil(prev => prev.map((r, i) => i === n - 1 ? { ...r, num: e.target.value } : r))} className="apple-select text-[12px]">
                      <option value="">Tipo...</option>
                      {["Piloto 1","Piloto 2","Peça de Mostruário","Repilotagem 1","Repilotagem 2","Repilotagem 3"].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  {/* Tópicos / bullets */}
                  <div className="space-y-1.5 mb-3">
                    {bullets.map((line, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[var(--label-tertiary)] text-[13px] select-none shrink-0">•</span>
                        <input type="text" value={line} onChange={e => {
                          const nb = [...bullets]; nb[i] = e.target.value;
                          setAn(prev => ({ ...prev, [k]: { ...a, texto: nb.join('\n') } }));
                        }} placeholder="Anotação..." className="apple-input flex-1 text-[12px]" />
                        {bullets.length > 1 && (
                          <button onClick={() => {
                            const nb = bullets.filter((_, j) => j !== i);
                            setAn(prev => ({ ...prev, [k]: { ...a, texto: nb.join('\n') } }));
                          }} className="text-[var(--label-tertiary)] hover:text-[var(--system-red)] text-[16px] leading-none shrink-0">×</button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setAn(prev => ({ ...prev, [k]: { ...a, texto: a.texto ? a.texto + '\n' : '\n' } }))} className="text-[11px] text-[var(--system-blue)] font-medium ml-5 mt-0.5">+ Adicionar tópico</button>
                  </div>
                  {/* Link vídeo */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[11px] text-[var(--label-tertiary)] shrink-0">Link vídeo:</span>
                    <input type="text" value={a.video} onChange={e => setAn(prev => ({ ...prev, [k]: { ...a, video: e.target.value } }))} placeholder="https://..." className="apple-input flex-1 text-[12px]" />
                  </div>
                  {/* Campos de pilotagem */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-[10px] text-[var(--label-tertiary)] mb-1 uppercase tracking-wide">Nº Lacre</div>
                      <input type="text" value={pilRow.lacre || ""} onChange={e => setPil(prev => prev.map((r, i) => i === n - 1 ? { ...r, lacre: e.target.value } : r))} className="apple-input w-full text-[12px]" placeholder="—" />
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--label-tertiary)] mb-1 uppercase tracking-wide">Data de Prova</div>
                      <div className="apple-input w-full text-[12px] text-[var(--label-secondary)]">{provaInfo[k]?.data ? provaInfo[k].data.split('-').reverse().join('/') : "—"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--label-tertiary)] mb-1 uppercase tracking-wide">Status</div>
                      <div className={`apple-input w-full text-[12px] font-semibold ${statusColor}`}>{piStatus || "—"}</div>
                    </div>
                  </div>
                </div>
              );
            })}</div>
          </>)}
        </div>)}

        {/* ═══ GRADUAÇÃO DE PRODUÇÃO ═══ */}
        {tab === "graduacao" && isProd && (statusLib === "APROVADO" || statusLib === "APROVADO COM RESTRIÇÃO") && (() => {
          // A base da graduação é a medida da TABELA BASE — não a medida
          // aferida na prova. A prova registra o que veio da peça piloto; a
          // graduação parte do que a tabela define para o tamanho base.
          const getMedidaBase = (g: any): string => valorGrad(g, gradBase);
          const calcRow = (g: any): Record<string, string> => {
            const medida = getMedidaBase(g);
            if (isNaN(tamNum(medida))) {
              const out: Record<string, string> = {};
              gradTamanhos.forEach(t => { out[t] = valorGrad(g, t); });
              return out;
            }
            return calcularDaBase(g, gradTamanhos, gradBase, medida);
          };
          const gradColor = statusLib === "APROVADO COM RESTRIÇÃO" ? "#f97316" : "#2DB564";
          return (
          <div className="px-3 sm:px-6 py-4 sm:py-6 space-y-5">
            {/* Header */}
            <div style={{ background: gradColor }} className="text-white rounded-xl px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-bold tracking-[0.04em]">GRADUAÇÃO DE PRODUÇÃO</span>
              <span className="text-[11px] font-semibold bg-white/15 px-3 py-0.5 rounded-full">{statusLib}</span>
              <span className="text-[12px]"><span className="text-white/60">Coleção</span> <span className="font-semibold ml-1">{row.colecao}</span></span>
            </div>

            {/* Info */}
            <div className="apple-card">
              <div className="grid grid-cols-2 sm:grid-cols-3">
                {([
                  ["Referência", row.ref],
                  ["Descrição", row.desc],
                  ["Operação", row.operacao],
                  ["Fornecedor", row.fornecedor],
                  ["Estilista", row.estilista],
                  ["Grade", row.grade],
                  ["Grupo", row.grupo],
                  ["Tabela Base", tm],
                  ["Tamanho", gradBase || "—"],
                  ["Tecido", row.tecido],
                  ["Composição", row.composicao],
                ] as [string, any][]).map(([l, v]) => <F key={l} l={l} v={v} />)}
              </div>
            </div>

            {/* Tabela de Graduação */}
            {gradAtivo.length === 0 ? (
              <div className="apple-card p-16 text-center"><p className="text-[15px] font-medium text-[var(--label-secondary)]">Nenhuma graduação cadastrada para esta tabela</p></div>
            ) : (
              <div className="apple-card overflow-x-auto">
                <table className="plm-table">
                  <thead>
                    <tr>
                      <th rowSpan={2} className="text-left min-w-[180px]">Descrição</th>
                      <th colSpan={gradTamanhos.length} className="text-center bg-[rgba(45,181,100,0.08)] text-[#2a7a4a]" style={{ borderBottom: "2px solid #2DB56444" }}>GRADUAÇÃO</th>
                      <th rowSpan={2} className="text-center w-24">Tolerância</th>
                    </tr>
                    <tr>
                      {gradTamanhos.map(t => (
                        <th key={t} className={`text-center w-16 ${t === gradBase ? "bg-[rgba(255,204,0,0.18)] text-[#856500] font-bold" : "bg-[rgba(45,181,100,0.04)] text-[#2a7a4a]"}`}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gradAtivo.map((g: any, i: number) => {
                      const calc = calcRow(g);
                      return (
                        <tr key={i}>
                          <td className="font-medium px-3">{g.desc}</td>
                          {gradTamanhos.map(t => (
                            t === gradBase ? (
                              <td key={t} className="text-center tabnum text-[13px] font-bold px-2 bg-[rgba(255,204,0,0.14)] text-[#856500]">{calc[t] || "—"}</td>
                            ) : (
                              <td key={t} className="text-center tabnum text-[13px] px-2 bg-[rgba(45,181,100,0.03)]">{calc[t] || "—"}</td>
                            )
                          ))}
                          <td className="text-center text-[12px] text-[var(--label-secondary)] px-2">{g.tol || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-[11px] text-[var(--label-tertiary)]">
              Coluna {gradBase} = medida da tabela base. Demais tamanhos calculados a partir dela somando as ampliações.
              {statusLib === "APROVADO COM RESTRIÇÃO" && <span className="ml-1 text-orange-500 font-semibold">Liberado com restrição — verificar pontos em vermelho antes de produção.</span>}
            </p>
          </div>
          );
        })()}

        </div>
        )}
        {/* Fica fora das tabs (sempre montado) mas dentro do diálogo: como filho
            do overlay, o .click() programático borbulharia até ele e fecharia a ficha. */}
        <input ref={fotoProvaRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFotoProva} />
      </div>
      <ConfirmDialog />
    </div>
  );
}

function F({ l, v }: { l: string; v: any }) { return <div className="flex items-baseline gap-2.5 px-4 py-2 border-b border-r border-[var(--separator)]"><span className="text-[11px] text-[var(--label-secondary)] whitespace-nowrap font-medium">{l}:</span><span className="text-[13px] font-semibold">{v || "—"}</span></div>; }
