"use client";
import { useEffect, useMemo, useState } from "react";
import { fetchCadastros, fetchEnvios, criarEnvio, addEnvioArquivos, setEnvioAtivo, removeEnvio, type Envio } from "@/lib/db";
import { uploadArquivo, deleteImage } from "@/lib/storage";
import { useAuth } from "@/lib/auth-context";
import { nomeUsuario } from "@/lib/utils";

const ESTAGIOS = ["DESENVOLVIMENTO", "MOSTRUÁRIO", "PRODUÇÃO"];

// Domínio público do PLM. Sai daqui e não da janela porque o link é entregue a
// terceiros — ver linkDe(). Dá para sobrescrever por NEXT_PUBLIC_SITE_URL sem
// mexer no código, caso o endereço mude.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://plm.austral.com.br").replace(/\/+$/, "");

// Os PDFs do lote saem como "23090002 - 22-09-2026", então a referência está
// no começo do nome. Ler dali poupa digitação e é o que faz o histórico
// responder por SKU — sem isso, sobraria só "o que foi para tal fornecedor".
// Vídeo é ordem de grandeza maior que PDF: uma ficha tem ~1 MB, um vídeo de
// celular passa de 100 MB com facilidade. Avisar antes é melhor do que deixar
// o upload correr por minutos e falhar no limite do Storage.
const LIMITE_AVISO_MB = 50;
const ehVideo = (nome: string) => /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(nome);

function refsDoNome(nome: string): string[] {
  const m = nome.match(/(\d{8})/g);
  return m ? Array.from(new Set(m)) : [];
}

function fmtTamanho(bytes: number) {
  if (!bytes) return "";
  const mb = bytes / 1048576;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
function fmtData(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export default function EnviosView() {
  const { user } = useAuth();
  const [cad, setCad] = useState<Record<string, any>>({});
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  // Formulário do novo envio
  const [novoOpen, setNovoOpen] = useState(false);
  const [nColecao, setNColecao] = useState("");
  const [nEstagio, setNEstagio] = useState(ESTAGIOS[0]);
  const [nFornecedor, setNFornecedor] = useState("");
  const [nObs, setNObs] = useState("");
  const [nArquivos, setNArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);

  // Filtros do histórico
  const [fColecao, setFColecao] = useState("");
  const [fEstagio, setFEstagio] = useState("");
  const [fFornecedor, setFFornecedor] = useState("");
  const [busca, setBusca] = useState("");

  useEffect(() => { carregar(); }, []);
  const carregar = async () => {
    setLoading(true);
    const [c, e] = await Promise.all([fetchCadastros(), fetchEnvios()]);
    setCad(c); setEnvios(e); setLoading(false);
  };

  const criar = async () => {
    if (!nColecao || !nFornecedor) { setMsg({ tipo: "erro", texto: "Escolha a coleção e o fornecedor." }); return; }
    if (!nArquivos.length) { setMsg({ tipo: "erro", texto: "Anexe pelo menos um PDF ou vídeo." }); return; }
    setEnviando(true); setProgresso(0); setMsg(null);

    const envio = await criarEnvio({
      colecao: nColecao, estagio: nEstagio, fornecedor: nFornecedor, observacao: nObs,
      criadoPorNome: user ? nomeUsuario(user) : "", criadoPorUserId: user?.id,
    });
    if (!envio) { setMsg({ tipo: "erro", texto: "Não foi possível criar o envio." }); setEnviando(false); return; }

    // Caminho espelha a organização de pastas que já era usada no OneDrive —
    // quem abrir o Storage direto reconhece a estrutura.
    const base = `envios/${nColecao}/${nEstagio}/${nFornecedor}`;
    const subidos: { nome: string; url: string; tamanho: number; refs: string[] }[] = [];
    const falhas: string[] = [];
    for (const f of nArquivos) {
      const url = await uploadArquivo(f, base);
      if (url) subidos.push({ nome: f.name, url, tamanho: f.size, refs: refsDoNome(f.name) });
      else falhas.push(f.name);
      setProgresso(p => p + 1);
    }
    if (subidos.length) await addEnvioArquivos(envio.id, subidos);

    setEnviando(false);
    setNovoOpen(false);
    setNArquivos([]); setNObs("");
    setMsg(falhas.length
      ? { tipo: "erro", texto: `Envio criado, mas ${falhas.length} arquivo(s) falharam: ${falhas.join(", ")}` }
      : { tipo: "ok", texto: `Envio criado com ${subidos.length} arquivo(s). O link já pode ser copiado.` });
    await carregar();
  };

  // O link vai para fora, então não pode depender de por onde a pessoa entrou:
  // quem acessa pelo endereço interno da Vercel copiaria um link "vercel.app"
  // para mandar ao fornecedor. Fixa o domínio próprio, com o endereço da janela
  // como último recurso.
  const linkDe = (e: Envio) => `${SITE_URL || (typeof window !== "undefined" ? window.location.origin : "")}/envio/${e.token}`;
  const copiar = async (e: Envio) => {
    try { await navigator.clipboard.writeText(linkDe(e)); setMsg({ tipo: "ok", texto: "Link copiado." }); }
    catch { setMsg({ tipo: "erro", texto: "Não foi possível copiar — selecione o endereço na tela." }); }
  };

  const excluir = async (e: Envio) => {
    if (!confirm(`Excluir o envio de ${e.fornecedor} (${e.colecao} · ${e.estagio}) e seus ${e.arquivos?.length || 0} arquivo(s)? O histórico é perdido.`)) return;
    for (const a of e.arquivos || []) await deleteImage(a.url);
    await removeEnvio(e.id);
    setMsg({ tipo: "ok", texto: "Envio excluído." });
    await carregar();
  };

  const alternarAtivo = async (e: Envio) => {
    await setEnvioAtivo(e.id, !e.ativo);
    setMsg({ tipo: "ok", texto: e.ativo ? "Link desativado — o fornecedor não abre mais." : "Link reativado." });
    await carregar();
  };

  const filtrados = useMemo(() => {
    const b = busca.trim().toUpperCase();
    return envios.filter(e =>
      (!fColecao || e.colecao === fColecao) &&
      (!fEstagio || e.estagio === fEstagio) &&
      (!fFornecedor || e.fornecedor === fFornecedor) &&
      (!b || e.fornecedor.toUpperCase().includes(b) || e.colecao.toUpperCase().includes(b)
        || (e.arquivos || []).some(a => a.nome.toUpperCase().includes(b) || (a.refs || []).some(r => r.includes(b))))
    );
  }, [envios, fColecao, fEstagio, fFornecedor, busca]);

  const inp = "text-[13px] border border-[var(--separator-opaque)] rounded-lg px-2.5 py-1.5 outline-none focus:border-[var(--system-blue)] bg-[var(--bg-primary)]";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="text-[20px] font-bold tracking-[-0.02em]">Envios para fornecedor</h2>
        <button onClick={() => setNovoOpen(v => !v)} className="apple-btn-primary ml-auto">{novoOpen ? "Fechar" : "Novo envio"}</button>
      </div>

      {msg && (
        <div className={`text-[13px] rounded-lg px-3 py-2 mb-3 ${msg.tipo === "ok" ? "bg-[rgba(52,199,89,0.12)] text-[#1a7a35]" : "bg-[rgba(255,59,48,0.1)] text-[var(--system-red)]"}`}>{msg.texto}</div>
      )}

      {novoOpen && (
        <div className="apple-card p-4 mb-5">
          <div className="flex gap-2 flex-wrap mb-3">
            <select className={`${inp} min-w-[160px]`} value={nColecao} onChange={e => setNColecao(e.target.value)}>
              <option value="">Coleção…</option>
              {(cad.colecao || []).map((c: string) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className={`${inp} min-w-[160px]`} value={nEstagio} onChange={e => setNEstagio(e.target.value)}>
              {ESTAGIOS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className={`${inp} min-w-[180px]`} value={nFornecedor} onChange={e => setNFornecedor(e.target.value)}>
              <option value="">Fornecedor…</option>
              {(cad.fornecedor || []).map((f: string) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <input className={`${inp} w-full mb-3`} value={nObs} onChange={e => setNObs(e.target.value)} placeholder="Observação para o fornecedor (opcional) — aparece na página do link" />
          <input type="file" accept="application/pdf,video/*" multiple className="text-[13px] mb-3 block"
            onChange={e => setNArquivos(Array.from(e.target.files || []).filter(f => f.type === "application/pdf" || f.type.startsWith("video/")))} />
          {nArquivos.length > 0 && (() => {
            const totalMB = nArquivos.reduce((s, f) => s + f.size, 0) / 1048576;
            const grandes = nArquivos.filter(f => f.size / 1048576 > LIMITE_AVISO_MB);
            return (
              <>
                <p className="text-[12px] text-[var(--label-tertiary)] mb-2">
                  {nArquivos.length} arquivo(s), {totalMB.toFixed(1)} MB: {nArquivos.map(f => f.name).join(", ")}
                </p>
                {grandes.length > 0 && (
                  <p className="text-[12px] text-[#8a5a00] bg-[#fff6de] border border-[#D97706] rounded-lg px-3 py-2 mb-3">
                    ⚠️ {grandes.length} arquivo(s) acima de {LIMITE_AVISO_MB} MB ({grandes.map(f => f.name).join(", ")}).
                    O envio pode demorar e, se o Storage tiver limite por arquivo menor que isso, falha.
                    Vale comprimir o vídeo antes.
                  </p>
                )}
              </>
            );
          })()}
          <button onClick={criar} disabled={enviando} className="apple-btn-primary disabled:opacity-40">
            {enviando ? `Enviando ${progresso}/${nArquivos.length}...` : "Criar envio"}
          </button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap mb-4">
        <select className={inp} value={fColecao} onChange={e => setFColecao(e.target.value)}>
          <option value="">Todas as coleções</option>
          {(cad.colecao || []).map((c: string) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={inp} value={fEstagio} onChange={e => setFEstagio(e.target.value)}>
          <option value="">Todos os estágios</option>
          {ESTAGIOS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={inp} value={fFornecedor} onChange={e => setFFornecedor(e.target.value)}>
          <option value="">Todos os fornecedores</option>
          {(cad.fornecedor || []).map((f: string) => <option key={f} value={f}>{f}</option>)}
        </select>
        <input className={`${inp} flex-1 min-w-[180px]`} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por referência, arquivo ou fornecedor..." />
      </div>

      {loading && <p className="text-[13px] text-[var(--label-tertiary)]">Carregando...</p>}
      {!loading && filtrados.length === 0 && <p className="text-[13px] text-[var(--label-tertiary)]">Nenhum envio encontrado.</p>}

      <div className="flex flex-col gap-3">
        {filtrados.map(e => (
          <div key={e.id} className="apple-card p-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-[14px] font-semibold">{e.fornecedor}</span>
              <span className="pill">{e.colecao}</span>
              <span className="pill">{e.estagio}</span>
              {!e.ativo && <span className="pill" style={{ background: "rgba(255,59,48,0.12)", color: "var(--system-red)" }}>link desativado</span>}
              <span className="text-[11px] text-[var(--label-tertiary)] ml-auto">
                {fmtData(e.created_at)}{e.criado_por_nome ? ` · ${e.criado_por_nome}` : ""}
              </span>
            </div>

            {e.observacao && <p className="text-[12px] text-[var(--label-secondary)] mb-2">{e.observacao}</p>}

            <div className="flex flex-col gap-1 mb-3">
              {(e.arquivos || []).map(a => (
                <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[var(--system-blue)] hover:underline">
                  {ehVideo(a.nome) ? "🎬" : "📄"} {a.nome} {a.tamanho ? <span className="text-[var(--label-quaternary)]">· {fmtTamanho(a.tamanho)}</span> : null}
                </a>
              ))}
              {!(e.arquivos || []).length && <span className="text-[12px] text-[var(--label-quaternary)]">sem arquivos</span>}
            </div>

            <div className="flex gap-2 flex-wrap items-center">
              <button onClick={() => copiar(e)} className="apple-btn-secondary text-[12px]">Copiar link</button>
              <button onClick={() => alternarAtivo(e)} className="apple-btn-secondary text-[12px]">{e.ativo ? "Desativar link" : "Reativar"}</button>
              <button onClick={() => excluir(e)} className="text-[12px] text-[var(--label-quaternary)] hover:text-[var(--system-red)] ml-auto">Excluir</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
