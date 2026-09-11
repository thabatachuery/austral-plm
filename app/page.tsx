"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import DevTable from "@/components/dev/DevTable";
import VariantesTable from "@/components/dev/VariantesTable";
import CadView from "@/components/cadastros/CadView";
import MedidasView from "@/components/medidas/MedidasView";
import FichaModal from "@/components/ficha/FichaModal";
import PreProducaoView from "@/components/preproducao/PreProducaoView";
import LaudoPPPedidosModal from "@/components/preproducao/LaudoPPPedidosModal";
import DashboardView from "@/components/dashboard/DashboardView";
import LoginModal from "@/components/auth/LoginModal";
import SetNewPasswordModal from "@/components/auth/SetNewPasswordModal";
import UsersModal from "@/components/settings/UsersModal";
import AlertaFichaModal, { type Alerta } from "@/components/ui/AlertaFichaModal";
import ExplosaoView from "@/components/compras/ExplosaoView";
import ControleFluxoView from "@/components/dev/ControleFluxoView";
import MapaColecaoView from "@/components/dev/MapaColecaoView";
import MapaEntregasView from "@/components/dev/MapaEntregasView";
import EtiquetasLineView from "@/components/dev/EtiquetasLineView";
import CalendarioView from "@/components/calendario/CalendarioView";
import { fetchProdutos, fetchAllVariantes, fetchVariantesPorColecao, fetchAlertasPendentes, marcarAlertasCiente, mapProduto } from "@/lib/db";
import { COMPRAS_STATUS_ALLOW } from "@/lib/constants";
import { subscribeRealtime } from "@/lib/realtime";
import { nomeUsuario } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

const TABS = [
  { id: "dashboard",  label: "Dashboard",      icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { id: "calendario",  label: "Calendário",    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { id: "dev",        label: "Desenvolvimento", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
  { id: "dev_fluxo",  label: "Controle de Fluxo", icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { id: "dev_mapa",      label: "Mapa de Coleção",   icon: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" },
  { id: "dev_etiquetas", label: "Etiquetas Line",    icon: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" },
  { id: "variantes",  label: "Variantes",       icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" },
  { id: "preprod",    label: "Pré-Produção",    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 13l2 2 4-4" },
  { id: "cad",        label: "Cadastros",       icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
  { id: "medidas",    label: "Tab. medidas",    icon: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" },
] as const;

const COMPRAS_TABS = [
  { id: "compras_dev",       label: "Desenvolvimento", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
  { id: "compras_variantes", label: "Variantes",       icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" },
  { id: "compras_explosao",  label: "Explosão",        icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
  { id: "compras_entregas",  label: "Mapa de Entregas", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
];

type Tab = (typeof TABS)[number]["id"] | "compras_dev" | "compras_variantes" | "compras_explosao" | "compras_entregas" | "dev_fluxo" | "dev_mapa" | "dev_etiquetas" | "calendario";

export default function Home() {
  const { user, loading: authLoading, signOut, passwordRecovery } = useAuth();
  const isAdmin = user?.app_metadata?.role === "admin";
  const perms: Record<string, boolean> = user?.app_metadata?.permissions || {};
  const canSection = (key: string) => isAdmin || perms[key] === true;
  const [tab, setTab] = useState<Tab>("dashboard");
  const [rows, setRows] = useState<any[]>([]);
  const [variantes, setVariantes] = useState<Record<string, string[]>>({});
  const [variantesPorColecao, setVariantesPorColecao] = useState<Record<string, Record<string, string[]>>>({});
  const comprasRows = rows.filter(r => COMPRAS_STATUS_ALLOW.includes(r.status));
  const [fichaRow, setFichaRow] = useState<any>(null);
  const [laudoRow, setLaudoRow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [alertaFila, setAlertaFila] = useState<Alerta[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [prods, vars, varsPorCol] = await Promise.all([fetchProdutos(), fetchAllVariantes(), fetchVariantesPorColecao()]);
    setRows(prods);
    setVariantesPorColecao(varsPorCol);
    setVariantes(vars);
    setLoading(false);
  }, []);

  useEffect(() => { if (user) loadData(); }, [loadData, user]);

  /* ── Alertas pendentes: avisos de alteração em fichas liberadas que este
     usuário ainda não deu "ciente" (inclusive de quando estava offline) ── */
  useEffect(() => {
    if (!user) return;
    fetchAlertasPendentes(user.id).then(setAlertaFila);
  }, [user]);

  /* As alterações de uma mesma edição chegam com o mesmo grupo_id e viram um
     aviso só. Alerta antigo (anterior à coluna grupo_id) tem grupo nulo e vale
     por si, como sempre valeu. */
  const gruposAlerta = useMemo(() => {
    // Objeto + lista de ordem em vez de Map: o projeto compila para ES5 e
    // iterar Map exige downlevelIteration.
    const porGrupo: Record<string, Alerta[]> = {};
    const ordem: string[] = [];
    for (const a of alertaFila) {
      const chave = a.grupo_id || `id:${a.id}`;
      if (!porGrupo[chave]) { porGrupo[chave] = []; ordem.push(chave); }
      porGrupo[chave].push(a);
    }
    return ordem.map(chave => porGrupo[chave]);
  }, [alertaFila]);

  const grupoAtual = gruposAlerta[0];
  const handleAlertaCiente = async () => {
    if (!user || !grupoAtual) return;
    const ids = grupoAtual.map((a: Alerta) => a.id);
    const noGrupo = new Set(ids);
    await marcarAlertasCiente(ids, user.id);
    setAlertaFila(prev => prev.filter(a => !noGrupo.has(a.id)));
  };

  /* Válvula para quem volta de férias com a fila cheia: sem isso, era clicar
     "OK, CIENTE" uma vez por aviso até o fim. */
  const handleAlertaCienteTodos = async () => {
    if (!user || !alertaFila.length) return;
    await marcarAlertasCiente(alertaFila.map(a => a.id), user.id);
    setAlertaFila([]);
  };

  /* ── Realtime: sincroniza produtos e variantes entre usuários ── */
  useEffect(() => {
    if (!user) return;
    let varTimer: ReturnType<typeof setTimeout> | null = null;
    let rowsTimer: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const reloadVariants = () => {
      if (varTimer) clearTimeout(varTimer);
      varTimer = setTimeout(async () => {
        if (!isMounted) return; // Previne update após desmonte
        const [vars, varsPorCol] = await Promise.all([fetchAllVariantes(), fetchVariantesPorColecao()]);
        if (!isMounted) return;
        setVariantes(vars);
        setVariantesPorColecao(varsPorCol);
      }, 1000);
    };
    // Compras/fluxo não têm patch incremental de linha — recarrega a tabela toda, com debounce.
    const reloadRows = () => {
      if (rowsTimer) clearTimeout(rowsTimer);
      rowsTimer = setTimeout(async () => {
        if (!isMounted) return;
        const prods = await fetchProdutos();
        if (!isMounted) return;
        setRows(prods);
      }, 1000);
    };
    const unsub = subscribeRealtime("produtos-sync", [
      {
        table: "produtos",
        // O realtime entrega a linha crua do banco (descricao, drop_num…), e a
        // tela lê desc/drop. Sem passar por mapProduto o valor novo chegava numa
        // chave que ninguém renderiza: a descrição alterada por outro usuário
        // simplesmente não aparecia até dar F5.
        onInsert: (row) => setRows(prev => {
          if (prev.some(r => r.id === row.id)) return prev;
          return [...prev, mapProduto(row)];
        }),
        onUpdate: (row) => setRows(prev => prev.map(r => {
          if (r.id !== row.id) return r;
          const novo = mapProduto(row);
          // SKU antigo pode não ter composição gravada — na carga ela vem
          // derivada do cadastro de tecidos. Não descarta essa derivada se o
          // tecido nem mudou.
          if (!novo.composicao && novo.tecido === r.tecido) novo.composicao = r.composicao;
          return { ...r, ...novo };
        })),
        onDelete: (old) => setRows(prev => prev.filter(r => r.id !== old.id)),
      },
      {
        table: "ficha_tecidos",
        onInsert: reloadVariants,
        onUpdate: reloadVariants,
        onDelete: reloadVariants,
      },
      {
        table: "controle_fluxo",
        onInsert: reloadRows,
        onUpdate: reloadRows,
        onDelete: reloadRows,
      },
      {
        table: "produto_variante_compras",
        onInsert: reloadRows,
        onUpdate: reloadRows,
        onDelete: reloadRows,
      },
    ]);
    return () => {
      isMounted = false;
      if (varTimer) clearTimeout(varTimer);
      if (rowsTimer) clearTimeout(rowsTimer);
      unsub();
    };
  }, [user]);

  /* ── Realtime: popup de alerta pros outros usuários quando alguém altera
     campo/cor/tecido/aviamento de um SKU já liberado/repilotando ── */
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeRealtime("alertas-sync", [
      {
        table: "alertas",
        onInsert: (row) => {
          if (row.alterado_por_user_id === user.id) return; // não avisa quem fez a própria alteração
          setAlertaFila(prev => [...prev, row]);
        },
      },
    ]);
    return unsub;
  }, [user]);

  /* A ficha lê descrição, tecido, composição e companhia direto do SKU, mas
     recebe uma cópia congelada no instante em que abriu. Sem isso, alterar o
     produto em Desenvolvimento (aqui ou em outra máquina, via realtime) não
     chegava na ficha aberta nem no PDF gerado a partir dela. */
  useEffect(() => {
    if (!fichaRow) return;
    const atual = rows.find(r => r.id === fichaRow.id);
    if (!atual || !Object.keys(atual).some(k => atual[k] !== fichaRow[k])) return;
    setFichaRow((prev: any) => prev && prev.id === atual.id ? { ...prev, ...atual } : prev);
  }, [rows, fichaRow]);

  const handleFichaSave = async (updatedRow: any, variantesChanged = true) => {
    setRows(prev => prev.map(r => r.id === updatedRow.id ? updatedRow : r));
    setFichaRow(updatedRow);
    // Variantes só derivam das cores dos tecidos — evita um fetch completo do
    // sistema a cada auto-save quando o que mudou não afeta variantes.
    if (variantesChanged) {
      const vars = await fetchAllVariantes();
      setVariantes(vars);
    }
  };

  if (authLoading) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-secondary)" }}>
      <div className="plm-loading"><div className="plm-loading-spinner" /></div>
    </div>
  );
  if (!user) return <LoginModal />;
  if (passwordRecovery) return <SetNewPasswordModal />;

  const today = new Date();
  const dateStr = today.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const greeting = today.getHours() < 12 ? "Bom dia" : today.getHours() < 18 ? "Boa tarde" : "Boa noite";
  const activeTab = [...TABS, ...COMPRAS_TABS].find(t => t.id === tab);

  return (
    <div className="plm-shell">
      {/* ═══ MOBILE OVERLAY ═══ */}
      <div className={`plm-sidebar-overlay ${mobileOpen ? "mobile-open" : ""}`} onClick={() => setMobileOpen(false)} />
      {/* ═══ SIDEBAR ═══ */}
      <aside className={`plm-sidebar ${sidebarCollapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="plm-sidebar-header">
          <div className="plm-logo">
            <div className="plm-logo-icon">
              <img src="/logo-austral.png" alt="Austral" style={{ width: 50, height: 50, objectFit: "contain", filter: "invert(1)", mixBlendMode: "screen" }} />
            </div>
            {!sidebarCollapsed && <div><span className="plm-logo-text">Austral</span><span className="plm-logo-sub">PLM</span></div>}
          </div>
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"} className="plm-sidebar-toggle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d={sidebarCollapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} /></svg>
          </button>
        </div>

        <nav className="plm-nav">
          <div className="plm-nav-label">{!sidebarCollapsed && "Menu"}</div>
          {/* Dashboard */}
          {TABS.filter(t => t.id === "dashboard").map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setMobileOpen(false); }} className={`plm-nav-item ${tab === t.id ? "active" : ""}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon} /></svg>
              {!sidebarCollapsed && <span>{t.label}</span>}
            </button>
          ))}
          {/* Calendário */}
          {TABS.filter(t => t.id === "calendario").map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setMobileOpen(false); }} className={`plm-nav-item ${tab === t.id ? "active" : ""}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon} /></svg>
              {!sidebarCollapsed && <span>{t.label}</span>}
            </button>
          ))}
          {/* Grupo Estilo */}
          <div className="plm-nav-label" style={{ marginTop: 8 }}>{!sidebarCollapsed && "Estilo"}</div>
          {TABS.filter(t => t.id !== "dashboard" && t.id !== "calendario").filter(t => {
            if (t.id === "cad")     return canSection("can_cadastros");
            if (t.id === "medidas") return canSection("can_medidas");
            if (t.id === "preprod") return canSection("can_preproducao");
            return true;
          }).map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setMobileOpen(false); }} className={`plm-nav-item ${tab === t.id ? "active" : ""}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon} /></svg>
              {!sidebarCollapsed && <span>{t.label}</span>}
            </button>
          ))}
          {/* Grupo Compras */}
          <div className="plm-nav-label" style={{ marginTop: 8 }}>{!sidebarCollapsed && "Compras"}</div>
          {COMPRAS_TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id as Tab); setMobileOpen(false); }} className={`plm-nav-item ${tab === t.id ? "active" : ""}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon} /></svg>
              {!sidebarCollapsed && <span>{t.label}</span>}
            </button>
          ))}
        </nav>

        {!sidebarCollapsed && (
          <div className="plm-sidebar-footer">
            <div className="plm-sidebar-stats">
              <div className="plm-stat-mini">
                <span className="plm-stat-mini-value">{rows.length}</span>
                <span className="plm-stat-mini-label">SKUs</span>
              </div>
              <div className="plm-stat-mini">
                <span className="plm-stat-mini-value">{rows.filter(r => r.status === "DESENVOLVIMENTO").length}</span>
                <span className="plm-stat-mini-label">Em desenv.</span>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ═══ MAIN ═══ */}
      <main className="plm-main">
        {/* Header */}
        <header className="plm-header">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="mobile-menu-btn w-9 h-9 rounded-lg bg-[var(--bg-secondary)] items-center justify-center text-[var(--label-secondary)]" style={{ display: "none" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div>
              <h1 className="plm-header-title">{activeTab?.label || "Dashboard"}</h1>
              <p className="plm-header-subtitle">{greeting} — <span style={{ textTransform: "capitalize" }}>{dateStr}</span></p>
            </div>
          </div>
          <div className="plm-header-actions">
            <div className="plm-header-badge">
              <span className="plm-header-badge-dot" />
              <span>{rows.filter(r => r.status === "DESENVOLVIMENTO").length} em desenvolvimento</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, borderLeft: "1px solid var(--separator)", paddingLeft: 12 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--label-primary)", lineHeight: 1.3 }}>
                  {nomeUsuario(user)}
                </div>
                <div style={{ fontSize: 11, color: "var(--label-tertiary)", lineHeight: 1.2 }}>{user.email}</div>
              </div>
              <button
                onClick={() => setShowUsers(true)}
                aria-label="Gerenciar usuários"
                title="Gerenciar usuários"
                style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--separator)", background: "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--label-tertiary)", transition: "all .15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--system-blue)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--system-blue)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--separator)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--label-tertiary)"; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
                </svg>
              </button>
              <button
                onClick={signOut}
                aria-label="Sair"
                title="Sair"
                style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--separator)", background: "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--label-tertiary)", transition: "all .15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--system-red)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--system-red)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--separator)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--label-tertiary)"; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="plm-content">
          {loading && <div className="plm-loading"><div className="plm-loading-spinner" /><span>Carregando...</span></div>}
          {!loading && tab === "dashboard" && <DashboardView rows={rows} variantes={variantes} />}
          {!loading && tab === "calendario" && <CalendarioView />}
          {!loading && tab === "dev" && <DevTable rows={rows} setRows={setRows} onOpenFicha={setFichaRow} userEmail={user.email!} />}
          {!loading && tab === "dev_fluxo" && <ControleFluxoView rows={rows} />}
          {!loading && tab === "variantes" && <VariantesTable rows={rows} variantes={variantes} variantesPorColecao={variantesPorColecao} onOpenFicha={setFichaRow} />}
          {!loading && tab === "preprod" && canSection("can_preproducao") && <PreProducaoView rows={rows} onOpenLaudo={setLaudoRow} />}
          {!loading && tab === "cad" && canSection("can_cadastros") && <CadView />}
          {!loading && tab === "medidas" && canSection("can_medidas") && <MedidasView />}
          {!loading && tab === "compras_dev" && <DevTable rows={comprasRows} setRows={setRows} onOpenFicha={setFichaRow} userEmail={user.email!} permPrefix="compras_" hiddenColumns={["piloto_most","tab_medidas"]} />}
          {!loading && tab === "compras_variantes" && <VariantesTable rows={comprasRows} variantes={variantes} variantesPorColecao={variantesPorColecao} onOpenFicha={setFichaRow} readOnly compras setRows={setRows} canEditOrders={isAdmin || perms["compras_pedidos"] === true} />}
          {!loading && tab === "compras_explosao" && <ExplosaoView comprasRows={comprasRows} variantes={variantes} />}
          {!loading && tab === "compras_entregas" && <MapaEntregasView />}
          {!loading && tab === "dev_mapa" && <MapaColecaoView rows={rows} />}
          {!loading && tab === "dev_etiquetas" && <EtiquetasLineView rows={rows} variantes={variantes} />}
        </div>
      </main>

      {fichaRow && <FichaModal row={fichaRow} onClose={() => setFichaRow(null)} onSave={handleFichaSave} />}
      {laudoRow && <LaudoPPPedidosModal row={laudoRow} onClose={() => setLaudoRow(null)} />}
      {showUsers && <UsersModal onClose={() => setShowUsers(false)} />}
      {grupoAtual && <AlertaFichaModal grupo={grupoAtual} avisosPendentes={gruposAlerta.length} alteracoesPendentes={alertaFila.length} onCiente={handleAlertaCiente} onCienteTodos={handleAlertaCienteTodos} />}
    </div>
  );
}
