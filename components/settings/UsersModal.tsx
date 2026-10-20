"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";

type UserRow = {
  id: string; email: string; nome: string;
  created_at: string; last_sign_in_at: string | null;
  role?: string; permissions?: Record<string, boolean>;
};

type PermGroup = { label: string; fields: { key: string; label: string }[] };

const BASE_GROUPS: PermGroup[] = [
  { label: "Geral",         fields: [{ key: "ref", label: "Referência" }, { key: "desc", label: "Descrição" }] },
  { label: "Status",        fields: [{ key: "status", label: "Status" }, { key: "piloto_most", label: "Piloto/Mostr." }] },
  { label: "Coleção",       fields: [{ key: "colecao", label: "Coleção" }, { key: "drop", label: "Drop" }] },
  { label: "Classificação", fields: [{ key: "grupo", label: "Grupo" }, { key: "subgrupo", label: "Subgrupo" }, { key: "categoria", label: "Categoria" }, { key: "subcategoria", label: "Subcategoria" }, { key: "linha", label: "Linha" }, { key: "tipo", label: "Tipo" }] },
  { label: "Produção",      fields: [{ key: "operacao", label: "Operação" }, { key: "fornecedor", label: "Fornecedor" }, { key: "grade", label: "Grade" }, { key: "tab_medidas", label: "Tab. medidas" }, { key: "tecido", label: "Tecido" }] },
  { label: "Equipe",        fields: [{ key: "estilista", label: "Estilista" }] },
  { label: "Ações",         fields: [{ key: "can_add", label: "Criar SKU" }, { key: "can_delete", label: "Excluir SKU" }] },
  { label: "Seções",        fields: [{ key: "can_cadastros", label: "Cadastros" }, { key: "can_medidas", label: "Tab. medidas" }, { key: "can_preproducao", label: "Pré-Produção" }] },
];

// Permissões ESTILO usam chaves diretas; COMPRAS usam prefixo "compras_"
const ESTILO_GROUPS: PermGroup[] = [
  ...BASE_GROUPS,
  { label: "Kanban de Fluxo", fields: [{ key: "fluxo_estilo", label: "Mover cards nas etapas de Estilo" }] },
];
const COMPRAS_BASE = BASE_GROUPS.map(g => ({
  ...g,
  fields: g.fields.map(f => ({ key: `compras_${f.key}`, label: f.label })),
}));
const COMPRAS_GROUPS: PermGroup[] = [
  ...COMPRAS_BASE,
  { label: "Status Compras", fields: [
    { key: "compras_status_preco",   label: "Status Preço (Sem custo / Solicitado / Negociação / Fechado)" },
    { key: "compras_status_compras", label: "Status Compras (Ped. most. / Mostruário / Ped. prod. / Entregue)" },
  ]},
  { label: "Preços",  fields: [{ key: "compras_precos",  label: "Editar preços (custo / markup / target / varejo)" }] },
  { label: "Pedidos", fields: [{ key: "compras_pedidos", label: "Editar pedidos (qtd / pedido / data de entrega)" }] },
  { label: "Kanban de Fluxo", fields: [{ key: "compras_fluxo", label: "Mover cards nas etapas de Compras" }] },
];

const ALL_ESTILO_KEYS  = ESTILO_GROUPS.flatMap(g  => g.fields.map(f => f.key));
const ALL_COMPRAS_KEYS = COMPRAS_GROUPS.flatMap(g => g.fields.map(f => f.key));

export default function UsersModal({ onClose }: { onClose: () => void }) {
  const { user: me } = useAuth();
  const [users, setUsers]     = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [adding, setAdding]   = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  // form fields
  const [fNome, setFNome]   = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fPass, setFPass]   = useState("");
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  // permissions panel state
  const [permUser, setPermUser]       = useState<UserRow | null>(null);
  const [editPerms, setEditPerms]     = useState<Record<string, boolean>>({});
  const [editRole, setEditRole]       = useState<"admin" | "user">("user");
  const [savingPerms, setSavingPerms] = useState(false);
  const [permTab, setPermTab]         = useState<"estilo" | "compras">("estilo");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    const json = await res.json();
    if (json.error) { setError(json.error); } else { setUsers(json.users); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); setFNome(""); setFEmail(""); setFPass(""); setFormErr(null); setAdding(true); setPermUser(null); };
  const openEdit = (u: UserRow) => { setEditing(u); setFNome(u.nome); setFEmail(u.email); setFPass(""); setFormErr(null); setAdding(true); setPermUser(null); };

  const save = async () => {
    setFormErr(null);
    if (!fEmail.trim()) { setFormErr("Informe o email."); return; }
    if (!editing && !fPass.trim()) { setFormErr("Informe a senha."); return; }
    setSaving(true);
    try {
      let res, json;
      if (editing) {
        const body: any = { nome: fNome.trim() };
        if (fPass.trim()) body.password = fPass.trim();
        res  = await fetch(`/api/users/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        json = await res.json();
      } else {
        res  = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: fEmail.trim(), password: fPass.trim(), nome: fNome.trim() }) });
        json = await res.json();
      }
      if (json.error) { setFormErr(json.error); } else { setAdding(false); load(); }
    } catch (e: any) { setFormErr(e.message); }
    setSaving(false);
  };

  const del = async (u: UserRow) => {
    if (u.id === me?.id) { alert("Você não pode excluir sua própria conta."); return; }
    if (!confirm(`Excluir o usuário ${u.email}?`)) return;
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) { alert(json.error || "Erro ao excluir usuário."); return; }
    load();
  };

  const openPerms = (u: UserRow) => {
    if (permUser?.id === u.id) { setPermUser(null); return; }
    setPermUser(u);
    setEditRole((u.role as any) || "user");
    setEditPerms(u.permissions || {});
    setPermTab("estilo");
  };

  const savePerms = async () => {
    if (!permUser) return;
    setSavingPerms(true);
    const body: any = { role: editRole };
    if (editRole !== "admin") body.permissions = editPerms;
    const res = await fetch(`/api/users/${permUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setSavingPerms(false);
    if (!res.ok || json.error) { alert(json.error || "Erro ao salvar permissões."); return; }
    setPermUser(null);
    load();
  };

  const togglePerm  = (key: string) => setEditPerms(p => ({ ...p, [key]: !p[key] }));
  const selectAll   = () => {
    const keys = permTab === "estilo" ? ALL_ESTILO_KEYS : ALL_COMPRAS_KEYS;
    setEditPerms(p => ({ ...p, ...Object.fromEntries(keys.map(k => [k, true])) }));
  };
  const clearAll    = () => {
    const keys = permTab === "estilo" ? ALL_ESTILO_KEYS : ALL_COMPRAS_KEYS;
    setEditPerms(p => { const n = { ...p }; keys.forEach(k => delete n[k]); return n; });
  };
  const activeGroups = permTab === "estilo" ? ESTILO_GROUPS : COMPRAS_GROUPS;

  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div className="apple-card" style={{ width: 700, maxHeight: "85vh", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--separator)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--label-primary)" }}>Usuários</div>
            <div style={{ fontSize: 12, color: "var(--label-secondary)", marginTop: 2 }}>Gerencie quem tem acesso ao PLM</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={openAdd} className="apple-btn-primary" style={{ fontSize: 13 }}>+ Novo usuário</button>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--separator)", background: "var(--bg-secondary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--label-secondary)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", flex: 1, padding: "0 24px 24px" }}>

          {/* Formulário de criar/editar */}
          {adding && (
            <div style={{ background: "var(--bg-secondary)", borderRadius: 12, padding: 20, margin: "16px 0 8px", border: "1px solid var(--separator)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: "var(--label-primary)" }}>
                {editing ? "Editar usuário" : "Novo usuário"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--label-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 5 }}>Nome</label>
                  <input value={fNome} onChange={e => setFNome(e.target.value)} placeholder="Ex: Thabata" className="apple-input" style={{ width: "100%" }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--label-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 5 }}>Email</label>
                  <input value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="email@austral.com.br" type="email" disabled={!!editing} className="apple-input" style={{ width: "100%", opacity: editing ? 0.6 : 1 }} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--label-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 5 }}>
                    {editing ? "Nova senha (deixe vazio para manter)" : "Senha"}
                  </label>
                  <input value={fPass} onChange={e => setFPass(e.target.value)} placeholder={editing ? "••••••••  (opcional)" : "Mínimo 6 caracteres"} type="password" className="apple-input" style={{ width: "100%" }} />
                </div>
              </div>
              {formErr && (
                <div style={{ background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.2)", color: "var(--system-red)", borderRadius: 8, padding: "8px 12px", fontSize: 12, marginTop: 10 }}>
                  {formErr}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                <button onClick={() => setAdding(false)} className="apple-btn-secondary" style={{ fontSize: 13 }}>Cancelar</button>
                <button onClick={save} disabled={saving} className="apple-btn-primary" style={{ fontSize: 13, opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Salvando…" : editing ? "Salvar alterações" : "Criar usuário"}
                </button>
              </div>
            </div>
          )}

          {error && <div style={{ color: "var(--system-red)", fontSize: 13, padding: "16px 0" }}>{error}</div>}

          {loading ? (
            <div className="plm-loading" style={{ padding: "32px 0" }}><div className="plm-loading-spinner" /></div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--separator)" }}>
                  {["Usuário", "Email", "Criado em", "Último acesso", ""].map(h => (
                    <th key={h} style={{ textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--label-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "8px 10px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <>
                    <tr key={u.id} style={{ borderBottom: permUser?.id === u.id ? "none" : "1px solid var(--separator)" }}>
                      <td style={{ padding: "12px 10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: u.id === me?.id ? "var(--system-blue)" : "var(--bg-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: u.id === me?.id ? "white" : "var(--label-secondary)" }}>
                              {(u.nome || u.email).charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--label-primary)" }}>{u.nome || "—"}</span>
                              {u.id === me?.id && (
                                <span style={{ fontSize: 10, background: "var(--system-blue)", color: "white", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>Você</span>
                              )}
                              {(u.role === "admin") ? (
                                <span style={{ fontSize: 10, background: "var(--system-blue)", color: "white", borderRadius: 4, padding: "1px 6px", fontWeight: 700, opacity: 0.85 }}>Admin</span>
                              ) : (
                                <span style={{ fontSize: 10, background: "var(--bg-tertiary)", color: "var(--label-secondary)", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>Usuário</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 10px", fontSize: 13, color: "var(--label-secondary)" }}>{u.email}</td>
                      <td style={{ padding: "12px 10px", fontSize: 12, color: "var(--label-tertiary)", whiteSpace: "nowrap" }}>{fmt(u.created_at)}</td>
                      <td style={{ padding: "12px 10px", fontSize: 12, color: "var(--label-tertiary)", whiteSpace: "nowrap" }}>{fmt(u.last_sign_in_at)}</td>
                      <td style={{ padding: "12px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <button onClick={() => openEdit(u)} style={{ fontSize: 12, color: "var(--system-blue)", background: "none", border: "none", cursor: "pointer", marginRight: 8, fontWeight: 500 }}>Editar</button>
                        <button
                          onClick={() => openPerms(u)}
                          style={{ fontSize: 12, color: permUser?.id === u.id ? "var(--system-blue)" : "var(--label-secondary)", background: permUser?.id === u.id ? "rgba(0,122,255,0.08)" : "none", border: "none", cursor: "pointer", marginRight: 8, fontWeight: 500, borderRadius: 6, padding: "3px 7px" }}
                        >
                          ⚙️ Permissões
                        </button>
                        {u.id !== me?.id && (
                          <button onClick={() => del(u)} style={{ fontSize: 12, color: "var(--system-red)", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}>Excluir</button>
                        )}
                      </td>
                    </tr>

                    {/* Permissions panel */}
                    {permUser?.id === u.id && (
                      <tr key={`${u.id}-perms`} style={{ borderBottom: "1px solid var(--separator)" }}>
                        <td colSpan={5} style={{ padding: "0 10px 16px" }}>
                          <div style={{ background: "var(--bg-secondary)", borderRadius: 12, padding: 18, border: "1px solid var(--separator)" }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--label-primary)", marginBottom: 14 }}>
                              Permissões de {u.nome || u.email}
                            </div>

                            {/* Admin toggle */}
                            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 16, padding: "10px 14px", background: editRole === "admin" ? "rgba(0,122,255,0.07)" : "var(--bg-primary)", borderRadius: 10, border: `1px solid ${editRole === "admin" ? "rgba(0,122,255,0.3)" : "var(--separator)"}` }}>
                              <input
                                type="checkbox"
                                checked={editRole === "admin"}
                                onChange={e => setEditRole(e.target.checked ? "admin" : "user")}
                                style={{ width: 16, height: 16, accentColor: "var(--system-blue)", cursor: "pointer" }}
                              />
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: editRole === "admin" ? "var(--system-blue)" : "var(--label-primary)" }}>Administrador (acesso total)</div>
                                <div style={{ fontSize: 11, color: "var(--label-tertiary)", marginTop: 1 }}>Pode editar todos os campos, criar e excluir SKUs</div>
                              </div>
                            </label>

                            {/* Field-level permissions (only shown when not admin) */}
                            {editRole !== "admin" && (
                              <>
                                {/* Abas Estilo / Compras */}
                                <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "var(--bg-primary)", borderRadius: 10, padding: 4, border: "1px solid var(--separator)" }}>
                                  {(["estilo", "compras"] as const).map(sec => (
                                    <button key={sec} onClick={() => setPermTab(sec)} style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, transition: "all .15s", background: permTab === sec ? "var(--system-blue)" : "transparent", color: permTab === sec ? "white" : "var(--label-secondary)" }}>
                                      {sec === "estilo" ? "Estilo" : "Compras"}
                                    </button>
                                  ))}
                                </div>

                                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                                  <button onClick={selectAll} className="apple-btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }}>Selecionar todos</button>
                                  <button onClick={clearAll}  className="apple-btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }}>Desmarcar todos</button>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                                  {activeGroups.map(group => (
                                    <div key={group.label} style={{ background: "var(--bg-primary)", borderRadius: 10, padding: "10px 12px", border: "1px solid var(--separator)" }}>
                                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--label-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{group.label}</div>
                                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                        {group.fields.map(f => (
                                          <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                                            <input
                                              type="checkbox"
                                              checked={editPerms[f.key] === true}
                                              onChange={() => togglePerm(f.key)}
                                              style={{ width: 14, height: 14, accentColor: "var(--system-blue)", cursor: "pointer", flexShrink: 0 }}
                                            />
                                            <span style={{ fontSize: 12, color: editPerms[f.key] ? "var(--label-primary)" : "var(--label-secondary)" }}>{f.label}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}

                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                              <button onClick={() => setPermUser(null)} className="apple-btn-secondary" style={{ fontSize: 13 }}>Cancelar</button>
                              <button onClick={savePerms} disabled={savingPerms} className="apple-btn-primary" style={{ fontSize: 13, opacity: savingPerms ? 0.6 : 1 }}>
                                {savingPerms ? "Salvando…" : "Salvar permissões"}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
