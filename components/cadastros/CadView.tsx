"use client";
import { useState, useEffect, useRef } from "react";
import { fetchCadastros, addCadastro, removeCadastro, addCadastrosBulk, fetchTecidos, addTecido, removeTecido, updateTecido, renameTecido, fetchAviamentos, addAviamento, addAviamentosBulk, removeAviamento, updateAviamento } from "@/lib/db";
import { ozParaGramatura } from "@/lib/peso";
import { uploadImage, deleteImage } from "@/lib/storage";
import { subscribeRealtime } from "@/lib/realtime";

const TABS=[{k:"grupo",l:"Grupo"},{k:"subgrupo",l:"Subgrupo"},{k:"categoria",l:"Categoria"},{k:"subcategoria",l:"Subcategoria"},{k:"linha",l:"Linha"},{k:"grade",l:"Grade"},{k:"operacao",l:"Operação"},{k:"tipo",l:"Tipo"},{k:"fornecedor",l:"Fornecedor"},{k:"drop",l:"Drop"},{k:"colecao",l:"Coleção"},{k:"status",l:"Status"},{k:"piloto_most",l:"Piloto / mostr."},{k:"estilista",l:"Estilista"},{k:"cor",l:"Cores"},{k:"tingimento",l:"Tipo de Tingimento"},{k:"aviamento",l:"Aviamentos"},{k:"tecido",l:"Tecidos"}];

// Cadastros importáveis do Linx. subcategoria/linha já ficam prontos: a API do
// BI ainda não envia esses campos (importam 0 por ora), mas ligam sozinhos
// assim que o /produtos passar a devolvê-los.
const IMPORTAVEIS_LINX = ["grupo","subgrupo","categoria","colecao","grade","fornecedor","subcategoria","linha"];

export default function CadView(){
  const [cad,setCad]=useState<Record<string,any>>({});const [tecidos,setTecidos]=useState<any[]>([]);const [aviamentos,setAviamentos]=useState<any[]>([]);
  const [m,setM]=useState("grupo");const [val,setVal]=useState("");const [loading,setLoading]=useState(true);
  const [tn,setTn]=useState("");const [tf,setTf]=useState("");const [tc,setTc]=useState("");const [tp,setTp]=useState("");
  // Dados técnicos do tecido + busca (a lista passa de mil itens)
  const [to,setTo]=useState("");const [tg,setTg]=useState("");const [tl,setTl]=useState("");const [tel,setTel]=useState("");const [tea,setTea]=useState("");const [tr,setTr]=useState("");
  const [st,setSt]=useState("");
  const [cc,setCc]=useState("");const [cn,setCn]=useState("");
  const [ac,setAc]=useState("");const [an,setAn]=useState("");const [ap,setAp]=useState("");const [al,setAl]=useState("");const [af,setAf]=useState("");const [acf,setAcf]=useState("");const [sr,setSr]=useState("");
  const [avImgUploading,setAvImgUploading]=useState<string|null>(null);
  const avImgRef=useRef<HTMLInputElement>(null);
  const [avImgTarget,setAvImgTarget]=useState<string|null>(null);
  // Foto por cor (aviamentos com várias cores, ex. botão bege/marrom/preto)
  const [avColorImgUploading,setAvColorImgUploading]=useState<string|null>(null);
  const avColorImgRef=useRef<HTMLInputElement>(null);
  const [avColorImgTarget,setAvColorImgTarget]=useState<{cod:string;cor:string}|null>(null);
  const [avCoresOpen,setAvCoresOpen]=useState<string|null>(null);
  const [importing,setImporting]=useState(false);
  const [importMsg,setImportMsg]=useState<{tipo:"ok"|"erro";texto:string}|null>(null);
  // Foto no formulário de criar aviamento
  const [newAvImg,setNewAvImg]=useState<string>("");
  const [newAvImgUp,setNewAvImgUp]=useState(false);
  const newAvImgRef=useRef<HTMLInputElement>(null);
  // Foto do tecido (mesmo padrão do aviamento: uma na linha da tabela, uma no formulário)
  const [tecImgUploading,setTecImgUploading]=useState<string|null>(null);
  const tecImgRef=useRef<HTMLInputElement>(null);
  const [tecImgTarget,setTecImgTarget]=useState<string|null>(null);
  const [newTecImg,setNewTecImg]=useState<string>("");
  const [newTecImgUp,setNewTecImgUp]=useState(false);
  const newTecImgRef=useRef<HTMLInputElement>(null);
  const [renomeando,setRenomeando]=useState<string|null>(null);

  useEffect(()=>{loadAll();},[]);

  // Importa aviamentos do Linx (endpoint ainda a ser criado pelo BI).
  const importarAviamentosDoLinx=async()=>{
    setImporting(true);setImportMsg(null);
    try{
      const {fetchLinxAviamentos}=await import("@/lib/linx-client");
      const {available,aviamentos:linxAv}=await fetchLinxAviamentos();
      if(!available){
        setImportMsg({tipo:"erro",texto:"O endpoint de aviamentos ainda não está disponível na API do Linx (aguardando o BI publicar)."});
        setImporting(false);return;
      }
      // Normaliza cores do Linx -> nomes (cores_disponiveis) + refs por cor (cores_fabricante)
      const mapCores=(a:any)=>{
        const cs=Array.isArray(a.cores)?a.cores:[];
        const nomes=cs.map((c:any)=>String(c.cor||"").toUpperCase()).filter(Boolean);
        const refs=cs.filter((c:any)=>c.cor).map((c:any)=>({cor:String(c.cor).toUpperCase(),ref:String(c.ref_cor_fabricante||"").toUpperCase()}));
        return {nomes,refs};
      };
      const existentesMap=new Map(aviamentos.map((a:any)=>[String(a.cod).toUpperCase(),a]));
      const faltando=linxAv.filter(a=>a.codigo&&!existentesMap.has(String(a.codigo).toUpperCase()))
        .map(a=>{const {nomes,refs}=mapCores(a);return {cod:String(a.codigo).toUpperCase(),nome:(a.nome||"").toUpperCase(),preco:a.custo||0,fornecedor:(a.fornecedor||"").toUpperCase(),codigo_fornecedor:(a.referencia_fabricante||"").toUpperCase(),unidade:(a.unidade||"").toUpperCase(),cores_disponiveis:nomes,cores_fabricante:refs};});
      if(faltando.length){
        const err=await addAviamentosBulk(faltando);
        if(err){setImportMsg({tipo:"erro",texto:"Erro ao importar aviamentos: "+err});setImporting(false);return;}
      }
      // Enriquece os que já existem: preenche ref. do fabricante e cores só quando estiverem vazias (não sobrescreve edição manual).
      let enriquecidos=0;
      for(const a of linxAv){
        const ex:any=existentesMap.get(String(a.codigo||"").toUpperCase());
        if(!ex)continue;
        const {nomes,refs}=mapCores(a);
        const patch:any={};
        if(a.referencia_fabricante&&!ex.codigo_fornecedor)patch.codigo_fornecedor=String(a.referencia_fabricante).toUpperCase();
        if(nomes.length&&!(ex.cores_disponiveis||[]).length)patch.cores_disponiveis=nomes;
        if(refs.length&&!(ex.cores_fabricante||[]).length)patch.cores_fabricante=refs;
        if(Object.keys(patch).length){await updateAviamento(ex.cod,patch);enriquecidos++;}
      }
      const a=await fetchAviamentos();setAviamentos(a);
      const partes=[];if(faltando.length)partes.push(`+${faltando.length} novos`);if(enriquecidos)partes.push(`${enriquecidos} atualizados`);
      setImportMsg({tipo:"ok",texto:partes.length?`Importado do Linx — Aviamentos: ${partes.join(", ")}`:"Nada novo — os aviamentos já estão atualizados com o Linx."});
    }catch(e:any){
      setImportMsg({tipo:"erro",texto:"Erro ao importar aviamentos: "+(e.message||"tente novamente")});
    }finally{
      setImporting(false);
    }
  };

  // Importa do Linx os 6 cadastros que a API fornece (adiciona só o que falta).
  const importarDoLinx=async()=>{
    setImporting(true);setImportMsg(null);
    try{
      const {fetchLinxCadastros}=await import("@/lib/linx-client");
      const linx=await fetchLinxCadastros();
      const resumo:string[]=[];
      for(const tab of IMPORTAVEIS_LINX){
        const existentes=new Set((cad[tab]||[]).map((v:string)=>v.toUpperCase()));
        const faltando=((linx as any)[tab]||[]).filter((v:string)=>!existentes.has(v.toUpperCase()));
        if(faltando.length){
          const err=await addCadastrosBulk(tab,faltando);
          if(err){setImportMsg({tipo:"erro",texto:`Erro ao importar ${TABS.find(t=>t.k===tab)?.l}: ${err}`});setImporting(false);return;}
          resumo.push(`${TABS.find(t=>t.k===tab)?.l}: +${faltando.length}`);
        }
      }
      const c=await fetchCadastros();setCad(c);
      setImportMsg({tipo:"ok",texto:resumo.length?`Importado do Linx — ${resumo.join(", ")}`:"Nada novo — os cadastros já estão atualizados com o Linx."});
    }catch(e:any){
      setImportMsg({tipo:"erro",texto:"Erro ao importar do Linx: "+(e.message||"tente novamente")});
    }finally{
      setImporting(false);
    }
  };

  /* Realtime: sincroniza cadastros entre usuários */
  useEffect(() => {
    const unsub = subscribeRealtime("cadastros-sync", [
      { table: "cadastros", onInsert: () => fetchCadastros().then(setCad), onUpdate: () => fetchCadastros().then(setCad), onDelete: () => fetchCadastros().then(setCad) },
      { table: "tecidos", onInsert: () => fetchTecidos().then(setTecidos), onUpdate: () => fetchTecidos().then(setTecidos), onDelete: () => fetchTecidos().then(setTecidos) },
      { table: "aviamentos", onInsert: () => fetchAviamentos().then(setAviamentos), onUpdate: () => fetchAviamentos().then(setAviamentos), onDelete: () => fetchAviamentos().then(setAviamentos) },
    ]);
    return unsub;
  }, []);
  const loadAll=async()=>{setLoading(true);const [c,t,a]=await Promise.all([fetchCadastros(),fetchTecidos(),fetchAviamentos()]);setCad(c);setTecidos(t);setAviamentos(a);setLoading(false);};

  const isSpecial=["tecido","cor","aviamento"].includes(m);const items=!isSpecial?(cad[m]||[]):[];const info=TABS.find(t=>t.k===m);

  const addS=async()=>{const v=val.trim().toUpperCase();if(!v||items.includes(v))return;await addCadastro(m,v);setCad(p=>({...p,[m]:[...(p[m]||[]),v]}));setVal("");};
  const remS=async(x:string)=>{await removeCadastro(m,x);setCad(p=>({...p,[m]:(p[m]||[]).filter((v:string)=>v!==x)}));};

  const addT=async()=>{
    if(!tn.trim())return;
    // Sem gramatura digitada, mas com oz: deduz a gramatura do oz (não deixa o registro sem os dois)
    const gramaturaFinal=tg.trim()?tg:(ozParaGramatura(to)?.toString()??tg);
    const t={nome:tn.trim().toUpperCase(),forn:tf.trim(),comp:tc.trim(),preco:tp,
      oz:to,gramatura:gramaturaFinal,largura:tl,enc_largura:tel,enc_altura:tea,rendimento:tr,imagem:newTecImg};
    await addTecido(t);
    setTecidos(p=>[...p,t].sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR")));
    setTn("");setTf("");setTc("");setTp("");setTo("");setTg("");setTl("");setTel("");setTea("");setTr("");setNewTecImg("");
  };
  const remT=async(n:string)=>{const t=tecidos.find((x:any)=>x.nome===n);if(t?.imagem)await deleteImage(t.imagem);await removeTecido(n);setTecidos(p=>p.filter(t=>t.nome!==n));};
  // Salva um campo do tecido ao sair do input (mesmo padrão dos aviamentos)
  const saveTec=async(nome:string,patch:Record<string,any>)=>{
    setTecidos(p=>p.map(t=>t.nome===nome?{...t,...patch}:t));
    const err=await updateTecido(nome,patch);
    if(err){setImportMsg({tipo:"erro",texto:err});await fetchTecidos().then(setTecidos);}
  };
  // Renomear é separado do saveTec: o nome é a chave que produtos e fichas
  // guardam, então a troca precisa ser propagada (renameTecido faz isso).
  // Recebe o próprio input para desfazer o texto recusado sem remontar a linha
  // (remontar roubaria o foco de quem só passou de um campo para o outro).
  const renomearTec=async(antigo:string,el:HTMLInputElement)=>{
    const novo=el.value.trim().toUpperCase();
    if(!novo||novo===antigo){el.value=antigo;return;}
    el.value=novo;
    setRenomeando(antigo);
    const r=await renameTecido(antigo,novo);
    setRenomeando(null);
    if(r.error){el.value=antigo;setImportMsg({tipo:"erro",texto:r.error});return;}
    setTecidos(p=>p.map(t=>t.nome===antigo?{...t,nome:novo}:t).sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR")));
    const usos=[r.produtos?`${r.produtos} SKU${r.produtos>1?"s":""}`:"",r.fichas?`${r.fichas} ficha${r.fichas>1?"s":""}`:""].filter(Boolean).join(" e ");
    setImportMsg({tipo:"ok",texto:`Tecido renomeado para "${novo}"${usos?` — ${usos} atualizado(s)`:""}.`});
  };
  const triggerTecImg=(nome:string)=>{setTecImgTarget(nome);tecImgRef.current?.click();};
  const handleTecImg=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];
    if(!file||!tecImgTarget)return;
    setTecImgUploading(tecImgTarget);
    const url=await uploadImage(file,`tecidos/${tecImgTarget}`);
    if(url)await saveTec(tecImgTarget,{imagem:url});
    setTecImgUploading(null);setTecImgTarget(null);
    if(tecImgRef.current)tecImgRef.current.value="";
  };
  const remTecImg=async(nome:string,url:string)=>{await deleteImage(url);await saveTec(nome,{imagem:""});};
  // No formulário a foto sobe antes do tecido existir — usa o nome digitado como pasta
  const handleNewTecImg=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];
    if(!file)return;
    const nome=tn.trim().toUpperCase();
    if(!nome){alert("Digite o nome do tecido antes de adicionar a foto.");if(newTecImgRef.current)newTecImgRef.current.value="";return;}
    setNewTecImgUp(true);
    const url=await uploadImage(file,`tecidos/${nome}`);
    if(url)setNewTecImg(url);
    setNewTecImgUp(false);
    if(newTecImgRef.current)newTecImgRef.current.value="";
  };

  const addAv=async()=>{if(!ac.trim()||!an.trim())return;const a={cod:ac.trim().toUpperCase(),nome:an.trim().toUpperCase(),preco:parseFloat(ap.replace(",","."))||0,localizacao_padrao:al.trim().toUpperCase(),fornecedor:af.trim().toUpperCase(),codigo_fornecedor:acf.trim().toUpperCase(),imagem:newAvImg};const err=await addAviamento(a);if(err){setImportMsg({tipo:"erro",texto:err});return;}setAviamentos(p=>[...p,{...a,cores_disponiveis:[]}]);setAc("");setAn("");setAp("");setAl("");setAf("");setAcf("");setNewAvImg("");};
  const handleNewAvImg=async(e:React.ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;const cod=ac.trim().toUpperCase();if(!cod){alert("Digite o código do aviamento antes de adicionar a foto.");if(newAvImgRef.current)newAvImgRef.current.value="";return;}setNewAvImgUp(true);const url=await uploadImage(file,`aviamentos/${cod}`);if(url)setNewAvImg(url);setNewAvImgUp(false);if(newAvImgRef.current)newAvImgRef.current.value="";};
  const remAv=async(cod:string)=>{const av=aviamentos.find((a:any)=>a.cod===cod);if(av?.imagem)await deleteImage(av.imagem);await removeAviamento(cod);setAviamentos(p=>p.filter(a=>a.cod!==cod));};
  const saveAv=async(cod:string,data:Record<string,any>)=>{await updateAviamento(cod,data);setAviamentos(p=>p.map((a:any)=>a.cod===cod?{...a,...data}:a));};
  const triggerAvImg=(cod:string)=>{setAvImgTarget(cod);avImgRef.current?.click();};
  const handleAvImg=async(e:React.ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file||!avImgTarget)return;setAvImgUploading(avImgTarget);const url=await uploadImage(file,`aviamentos/${avImgTarget}`);if(url)await saveAv(avImgTarget,{imagem:url});setAvImgUploading(null);setAvImgTarget(null);if(avImgRef.current)avImgRef.current.value="";};
  const remAvImg=async(cod:string,url:string)=>{await deleteImage(url);await saveAv(cod,{imagem:""});};
  const triggerAvColorImg=(cod:string,cor:string)=>{setAvColorImgTarget({cod,cor});avColorImgRef.current?.click();};
  const handleAvColorImg=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];
    if(!file||!avColorImgTarget)return;
    const {cod,cor}=avColorImgTarget;
    setAvColorImgUploading(`${cod}:${cor}`);
    const url=await uploadImage(file,`aviamentos/${cod}/cores/${cor}`);
    if(url){
      const av=aviamentos.find((a:any)=>a.cod===cod);
      await saveAv(cod,{imagens_cores:{...(av?.imagens_cores||{}),[cor]:url}});
    }
    setAvColorImgUploading(null);setAvColorImgTarget(null);
    if(avColorImgRef.current)avColorImgRef.current.value="";
  };
  const remAvColorImg=async(cod:string,cor:string,url:string)=>{
    await deleteImage(url);
    const av=aviamentos.find((a:any)=>a.cod===cod);
    const next={...(av?.imagens_cores||{})};
    delete next[cor];
    await saveAv(cod,{imagens_cores:next});
  };

  const addCor=async()=>{if(!cc.trim()||!cn.trim())return;const nome=`${cc.trim().toUpperCase()} - ${cn.trim().toUpperCase()}`;await addCadastro("cor",nome);setCad(p=>({...p,cor:[...(p.cor||[]),nome]}));setCc("");setCn("");};
  const remCor=async(nome:string)=>{await removeCadastro("cor",nome);setCad(p=>({...p,cor:(p.cor||[]).filter((c:string)=>c!==nome)}));};

  const gc=(k:string)=>{if(k==="tecido")return tecidos.length;if(k==="aviamento")return aviamentos.length;if(k==="cor")return(cad.cor||[]).length;return(cad[k]||[]).length;};
  const fa=sr?aviamentos.filter((a:any)=>(a.cod+a.nome).toLowerCase().includes(sr.toLowerCase())):aviamentos;
  const ft=st?tecidos.filter((t:any)=>`${t.nome} ${t.forn} ${t.comp}`.toLowerCase().includes(st.toLowerCase())):tecidos;
  const inp="apple-input";const btn="apple-btn-primary";

  if(loading) return <div className="text-center py-20 text-[var(--label-tertiary)]">Carregando cadastros...</div>;

  return(
    <div className="flex flex-col sm:flex-row gap-5 min-h-[400px]">
      {/* Sidebar de categorias */}
      <div className="w-full sm:w-[220px] flex-shrink-0">
        <div className="apple-card p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--label-tertiary)] px-2 mb-2">Cadastros</div>
          <nav className="flex sm:flex-col gap-0.5 overflow-x-auto sm:overflow-x-visible sm:max-h-[calc(100vh-220px)] sm:overflow-y-auto">
            {TABS.map(t=>{const c=gc(t.k);const on=m===t.k;return(
              <button key={t.k} onClick={()=>{setM(t.k);setSr("");setImportMsg(null);}} className={`flex justify-between items-center px-2.5 py-[7px] rounded-lg text-[13px] text-left transition-all whitespace-nowrap ${on?"font-semibold bg-[var(--system-blue)] text-white":"text-[var(--label-primary)] hover:bg-[var(--bg-secondary)]"}`}>
                <span>{t.l}</span>
                <span className={`text-[11px] tabnum ml-2 ${on?"text-white/70":"text-[var(--label-tertiary)]"}`}>{c}</span>
              </button>
            );})}
          </nav>
        </div>
      </div>

      {/* Conteúdo principal */}
      <div className="flex-1 min-w-0">
        <div className="apple-card">
          {/* Header do cadastro */}
          <div className="px-5 pt-5 pb-4 border-b border-[var(--separator)]">
            <div className="flex items-baseline justify-between mb-1 gap-3">
              <h3 className="text-[20px] font-bold tracking-[-0.02em]">{info?.l}</h3>
              <div className="flex items-center gap-3">
                {(IMPORTAVEIS_LINX.includes(m) || m==="aviamento") && (
                  <button
                    onClick={m==="aviamento"?importarAviamentosDoLinx:importarDoLinx}
                    disabled={importing}
                    className="apple-btn-secondary text-[12px] flex items-center gap-1.5 whitespace-nowrap"
                    style={{ opacity: importing ? 0.6 : 1 }}
                    title={m==="aviamento"?"Puxa os aviamentos do Linx (adiciona só o que falta)":"Puxa os valores deste cadastro do Linx (adiciona só o que falta)"}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>
                    {importing ? "Importando…" : "Importar do Linx"}
                  </button>
                )}
                <span className="text-[12px] text-[var(--label-tertiary)] tabnum">{m==="aviamento"?`${aviamentos.length} aviamentos`:m==="cor"?`${(cad.cor||[]).length} cores`:m==="tecido"?`${tecidos.length} tecidos`:`${items.length} itens`}</span>
              </div>
            </div>
            {(IMPORTAVEIS_LINX.includes(m) || m==="aviamento" || m==="tecido") && importMsg && (
              <div className="mt-2 text-[12px] rounded-lg px-3 py-2" style={importMsg.tipo==="ok"
                ? { background: "rgba(52,199,89,0.1)", color: "#1a7a35" }
                : { background: "rgba(255,59,48,0.08)", color: "var(--system-red)" }}>
                {importMsg.texto}
              </div>
            )}
          </div>

          {/* Conteúdo interno */}
          <div className="px-5 py-5">
            {/* Cadastros simples (grupo, subgrupo, etc.) */}
            {!isSpecial&&m!=="cor"&&(<>
              <div className="flex gap-2 mb-5">
                <input type="text" aria-label={`Novo ${info?.l?.toLowerCase()}`} value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addS()} placeholder="Novo item..." className={`${inp} flex-1`}/>
                <button onClick={addS} className={btn}>Adicionar</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {items.map((x:string)=>(
                  <span key={x} className="inline-flex items-center gap-2 bg-[var(--bg-secondary)] border border-[var(--separator)] rounded-lg px-3.5 py-[7px] text-[13px] font-medium transition-all hover:border-[var(--label-quaternary)]">
                    {x}
                    <button onClick={()=>remS(x)} className="text-[var(--label-quaternary)] hover:text-[var(--system-red)] text-[14px] leading-none transition-colors">×</button>
                  </span>
                ))}
                {items.length === 0 && <p className="text-[13px] text-[var(--label-tertiary)] py-8 text-center w-full">Nenhum item cadastrado</p>}
              </div>
            </>)}

            {/* Cores */}
            {m==="cor"&&(<>
              <div className="flex flex-wrap gap-2 mb-5">
                <input className={`${inp} w-24`} aria-label="Código da cor" value={cc} onChange={e=>setCc(e.target.value)} placeholder="Código"/>
                <input className={`${inp} flex-1 min-w-[140px]`} aria-label="Nome da cor" value={cn} onChange={e=>setCn(e.target.value)} placeholder="Nome da cor" onKeyDown={e=>e.key==="Enter"&&addCor()}/>
                <button onClick={addCor} className={btn}>Adicionar</button>
              </div>
              <div className="border border-[var(--separator)] rounded-xl overflow-hidden">
                <table className="plm-table"><thead><tr><th className="px-4">Cor (Código - Nome)</th><th className="w-10"></th></tr></thead>
                <tbody>{(cad.cor||[]).map((c:string)=>(
                  <tr key={c}><td className="font-medium px-4">{c}</td><td className="text-center"><button onClick={()=>remCor(c)} className="text-[var(--label-quaternary)] hover:text-[var(--system-red)] transition-colors">×</button></td></tr>
                ))}</tbody></table>
              </div>
            </>)}

            {/* Aviamentos */}
            {m==="aviamento"&&(<>
              <input type="file" accept="image/*" ref={avImgRef} className="hidden" onChange={handleAvImg}/>
              <input type="file" accept="image/*" ref={avColorImgRef} className="hidden" onChange={handleAvColorImg}/>
              <input type="file" accept="image/*" ref={newAvImgRef} className="hidden" onChange={handleNewAvImg}/>
              <div className="flex flex-wrap items-start gap-2 mb-3">
                {/* Foto do novo aviamento */}
                {newAvImgUp
                  ? <div className="w-[42px] h-[42px] rounded border border-[var(--separator)] flex items-center justify-center text-[10px] text-[var(--label-tertiary)] shrink-0">...</div>
                  : newAvImg
                    ? <div className="relative inline-block shrink-0">
                        <img src={newAvImg} alt="Foto do novo aviamento" onClick={()=>newAvImgRef.current?.click()} className="w-[42px] h-[42px] object-contain rounded border border-[var(--separator)] cursor-pointer hover:opacity-80" title="Clique para trocar"/>
                        <button onClick={()=>setNewAvImg("")} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] leading-none flex items-center justify-center" title="Remover foto">×</button>
                      </div>
                    : <button onClick={()=>newAvImgRef.current?.click()} className="w-[42px] h-[42px] border-2 border-dashed border-[var(--separator-opaque)] rounded-lg flex flex-col items-center justify-center gap-0.5 text-[var(--label-quaternary)] hover:border-[var(--system-blue)] hover:text-[var(--system-blue)] transition-colors shrink-0" title="Adicionar foto (digite o código primeiro)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                        <span className="text-[8px] font-medium leading-none">foto</span>
                      </button>}
                <input className={`${inp} w-28`} aria-label="Nosso código do aviamento" value={ac} onChange={e=>setAc(e.target.value)} placeholder="Nosso código"/>
                <input className={`${inp} flex-1 min-w-[120px]`} aria-label="Nome do aviamento" value={an} onChange={e=>setAn(e.target.value)} placeholder="Nome"/>
                <input className={`${inp} w-24`} aria-label="Preço do aviamento" value={ap} onChange={e=>setAp(e.target.value)} placeholder="Preço"/>
                <input className={`${inp} flex-1 min-w-[150px]`} aria-label="Localização padrão do aviamento" value={al} onChange={e=>setAl(e.target.value)} placeholder="Localização padrão"/>
                <input className={`${inp} flex-1 min-w-[120px]`} aria-label="Fornecedor do aviamento" value={af} onChange={e=>setAf(e.target.value)} placeholder="Fornecedor"/>
                <input className={`${inp} w-32`} aria-label="Código do fornecedor do aviamento" value={acf} onChange={e=>setAcf(e.target.value)} placeholder="Cód. fornecedor"/>
                <button onClick={addAv} className={btn}>Adicionar</button>
              </div>
              <div className="mb-4">
                <input type="text" aria-label="Buscar aviamento por código ou nome" value={sr} onChange={e=>setSr(e.target.value)} placeholder="Buscar aviamento..." className={`${inp} w-full`}/>
              </div>
              <div className="border border-[var(--separator)] rounded-xl overflow-hidden max-h-[540px] overflow-y-auto overscroll-y-contain">
                {avCoresOpen && <div className="fixed inset-0 z-40" onClick={() => setAvCoresOpen(null)} />}
                <table className="plm-table"><thead><tr>
                  <th className="w-16 px-3 text-center">Foto</th>
                  <th className="w-28">Nosso cód.</th>
                  <th>Nome</th>
                  <th className="min-w-[120px]">Fornecedor</th>
                  <th className="w-32">Cód. fornecedor</th>
                  <th className="min-w-[200px]">Cores disponíveis</th>
                  <th className="min-w-[180px]">Localização padrão</th>
                  <th className="w-20">Unidade</th>
                  <th className="w-24 text-right">Preço (R$)</th>
                  <th className="w-10"></th>
                </tr></thead>
                <tbody>{fa.map((a:any)=>(
                  <tr key={a.cod}>
                    {/* ── Foto ── */}
                    <td className="text-center px-2 py-1.5">
                      {avImgUploading===a.cod
                        ? <div className="w-12 h-12 rounded border border-[var(--separator)] mx-auto flex items-center justify-center text-[10px] text-[var(--label-tertiary)]">...</div>
                        : a.imagem
                          ? <div className="relative inline-block group">
                              <img src={a.imagem} alt={a.nome} onClick={()=>triggerAvImg(a.cod)} className="w-12 h-12 object-contain rounded border border-[var(--separator)] cursor-pointer hover:opacity-80 transition-opacity" title="Clique para trocar"/>
                              <button onClick={e=>{e.stopPropagation();remAvImg(a.cod,a.imagem);}} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" title="Remover foto">×</button>
                            </div>
                          : <button onClick={()=>triggerAvImg(a.cod)} className="w-12 h-12 border-2 border-dashed border-[var(--separator-opaque)] rounded-lg flex flex-col items-center justify-center gap-0.5 text-[var(--label-quaternary)] hover:border-[var(--system-blue)] hover:text-[var(--system-blue)] transition-colors mx-auto" title="Adicionar foto">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                              <span className="text-[8px] font-medium leading-none">foto</span>
                            </button>}
                    </td>
                    {/* ── Código (readonly) ── */}
                    <td className="font-mono text-[12px] text-[var(--label-secondary)] px-3">{a.cod}</td>
                    {/* ── Nome (editável) ── */}
                    <td className="px-2 py-1">
                      <input className="w-full text-[13px] font-medium border border-transparent rounded-lg px-2 py-1 outline-none bg-transparent hover:border-[var(--separator-opaque)] focus:border-[var(--system-blue)] focus:bg-[var(--bg-primary)] transition-all" defaultValue={a.nome} onBlur={e=>{const v=e.target.value.trim().toUpperCase();if(v&&v!==a.nome)saveAv(a.cod,{nome:v});}}/>
                    </td>
                    {/* ── Fornecedor (editável) ── */}
                    <td className="px-2 py-1">
                      <input className="w-full text-[12px] border border-transparent rounded-lg px-2 py-1 outline-none bg-transparent hover:border-[var(--separator-opaque)] focus:border-[var(--system-blue)] focus:bg-[var(--bg-primary)] transition-all" defaultValue={a.fornecedor} placeholder="—" onBlur={e=>{const v=e.target.value.trim().toUpperCase();if(v!==a.fornecedor)saveAv(a.cod,{fornecedor:v});}}/>
                    </td>
                    {/* ── Cód. Fornecedor (editável) ── */}
                    <td className="px-2 py-1">
                      <input className="w-full text-[12px] font-mono border border-transparent rounded-lg px-2 py-1 outline-none bg-transparent hover:border-[var(--separator-opaque)] focus:border-[var(--system-blue)] focus:bg-[var(--bg-primary)] transition-all" defaultValue={a.codigo_fornecedor} placeholder="—" onBlur={e=>{const v=e.target.value.trim().toUpperCase();if(v!==a.codigo_fornecedor)saveAv(a.cod,{codigo_fornecedor:v});}}/>
                    </td>
                    {/* ── Cores disponíveis ── */}
                    <td className="px-2 py-1.5">
                      <div className="relative z-50">
                        <div className="flex flex-wrap gap-1 items-center">
                          {(a.cores_disponiveis||[]).map((c:string)=>{
                            const refCor=(a.cores_fabricante||[]).find((x:any)=>String(x.cor).toUpperCase()===String(c).toUpperCase())?.ref;
                            const fotoCor=a.imagens_cores?.[c];
                            const uploadingCor=avColorImgUploading===`${a.cod}:${c}`;
                            return (
                            <span key={c} title={refCor?`Ref. cor fabricante: ${refCor}`:undefined} className="inline-flex items-center gap-1 text-[10px] font-medium bg-[var(--bg-tertiary)] border border-[var(--separator)] rounded-md pl-0.5 pr-1.5 py-0.5 leading-none">
                              <span className="relative inline-block group/foto">
                                {uploadingCor
                                  ? <span className="w-4 h-4 rounded-full border border-[var(--separator)] flex items-center justify-center text-[6px]">…</span>
                                  : fotoCor
                                    ? <img src={fotoCor} alt={c} onClick={()=>triggerAvColorImg(a.cod,c)} className="w-4 h-4 rounded-full object-cover cursor-pointer border border-[var(--separator)]" title="Clique para trocar a foto desta cor"/>
                                    : <button onClick={()=>triggerAvColorImg(a.cod,c)} className="w-4 h-4 rounded-full border border-dashed border-[var(--label-quaternary)] flex items-center justify-center text-[var(--label-quaternary)] hover:border-[var(--system-blue)] hover:text-[var(--system-blue)] transition-colors" title="Adicionar foto desta cor">
                                        <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                                      </button>}
                                {fotoCor && <button onClick={e=>{e.stopPropagation();remAvColorImg(a.cod,c,fotoCor);}} className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 text-white text-[6px] leading-none flex items-center justify-center opacity-0 group-hover/foto:opacity-100 transition-opacity" title="Remover foto desta cor">×</button>}
                              </span>
                              {c}{refCor&&<span className="text-[9px] font-mono text-[var(--system-blue)]">· {refCor}</span>}
                              <button onClick={()=>{const next=(a.cores_disponiveis||[]).filter((x:string)=>x!==c);saveAv(a.cod,{cores_disponiveis:next});}} className="text-[var(--label-quaternary)] hover:text-red-500 leading-none">×</button>
                            </span>
                            );
                          })}
                          <button onClick={()=>setAvCoresOpen(avCoresOpen===a.cod?null:a.cod)} className="text-[11px] text-[var(--system-blue)] border border-dashed border-[var(--system-blue)] rounded-md px-1.5 py-0.5 hover:opacity-70 leading-none">+</button>
                        </div>
                        {avCoresOpen===a.cod&&(
                          <div className="absolute z-50 top-full left-0 mt-1 bg-[var(--bg-primary)] border border-[var(--separator-opaque)] rounded-xl shadow-lg p-2 min-w-[200px] max-h-[220px] overflow-y-auto">
                            {(cad.cor||[]).map((c:string)=>{const checked=(a.cores_disponiveis||[]).includes(c);return(
                              <label key={c} className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-secondary)] rounded-lg cursor-pointer">
                                <input type="checkbox" checked={checked} onChange={()=>{const next=checked?(a.cores_disponiveis||[]).filter((x:string)=>x!==c):[...(a.cores_disponiveis||[]),c];saveAv(a.cod,{cores_disponiveis:next});}} className="rounded"/>
                                <span className="text-[12px]">{c}</span>
                              </label>
                            );})}
                            {!(cad.cor||[]).length&&<p className="text-[11px] text-[var(--label-tertiary)] px-2 py-2">Nenhuma cor cadastrada</p>}
                          </div>
                        )}
                      </div>
                    </td>
                    {/* ── Localização (editável) ── */}
                    <td className="px-2 py-1">
                      <input className="w-full text-[12px] border border-transparent rounded-lg px-2 py-1 outline-none bg-transparent hover:border-[var(--separator-opaque)] focus:border-[var(--system-blue)] focus:bg-[var(--bg-primary)] transition-all" defaultValue={a.localizacao_padrao} placeholder="—" onBlur={e=>{const v=e.target.value.trim().toUpperCase();if(v!==a.localizacao_padrao)saveAv(a.cod,{localizacao_padrao:v});}}/>
                    </td>
                    {/* ── Unidade (editável) ── */}
                    <td className="px-2 py-1">
                      <input className="w-full text-[12px] text-center uppercase border border-transparent rounded-lg px-2 py-1 outline-none bg-transparent hover:border-[var(--separator-opaque)] focus:border-[var(--system-blue)] focus:bg-[var(--bg-primary)] transition-all" defaultValue={a.unidade} placeholder="—" onBlur={e=>{const v=e.target.value.trim().toUpperCase();if(v!==a.unidade)saveAv(a.cod,{unidade:v});}}/>
                    </td>
                    {/* ── Preço (editável) ── */}
                    <td className="px-2 py-1">
                      {/* text + decimal: com type="number" a vírgula era rejeitada
                          e "12,50" virava 0. O replace cobre o parseFloat, que
                          pararia na vírgula. */}
                      <input type="text" inputMode="decimal" className="w-full text-[13px] text-right tabnum border border-transparent rounded-lg px-2 py-1 outline-none bg-transparent hover:border-[var(--separator-opaque)] focus:border-[var(--system-blue)] focus:bg-[var(--bg-primary)] transition-all" defaultValue={a.preco||""} placeholder="0,00" onBlur={e=>{const v=parseFloat(e.target.value.replace(",","."))||0;if(v!==a.preco)saveAv(a.cod,{preco:v});}}/>
                    </td>
                    {/* ── Excluir ── */}
                    <td className="text-center px-2">
                      <button onClick={()=>remAv(a.cod)} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--label-quaternary)] hover:bg-red-50 hover:text-red-500 transition-colors mx-auto" title="Excluir aviamento">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </td>
                  </tr>
                ))}</tbody></table>
              </div>
              <p className="text-[11px] text-[var(--label-tertiary)] mt-2">{fa.length} de {aviamentos.length}</p>
            </>)}

            {/* Tecidos */}
            {m==="tecido"&&(<>
              <input type="file" accept="image/*" ref={tecImgRef} className="hidden" onChange={handleTecImg}/>
              <input type="file" accept="image/*" ref={newTecImgRef} className="hidden" onChange={handleNewTecImg}/>
              <div className="flex gap-2 mb-2 flex-wrap items-start">
                {/* Foto do novo tecido */}
                {newTecImgUp
                  ? <div className="w-[42px] h-[42px] rounded border border-[var(--separator)] flex items-center justify-center text-[10px] text-[var(--label-tertiary)] shrink-0">...</div>
                  : newTecImg
                    ? <div className="relative inline-block shrink-0">
                        <img src={newTecImg} alt="Foto do novo tecido" onClick={()=>newTecImgRef.current?.click()} className="w-[42px] h-[42px] object-cover rounded border border-[var(--separator)] cursor-pointer hover:opacity-80" title="Clique para trocar"/>
                        <button onClick={()=>setNewTecImg("")} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] leading-none flex items-center justify-center" title="Remover foto">×</button>
                      </div>
                    : <button onClick={()=>newTecImgRef.current?.click()} className="w-[42px] h-[42px] border-2 border-dashed border-[var(--separator-opaque)] rounded-lg flex flex-col items-center justify-center gap-0.5 text-[var(--label-quaternary)] hover:border-[var(--system-blue)] hover:text-[var(--system-blue)] transition-colors shrink-0" title="Adicionar foto (digite o nome primeiro)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                        <span className="text-[8px] font-medium leading-none">foto</span>
                      </button>}
                <input className={`${inp} flex-[2] min-w-[150px]`} value={tn} onChange={e=>setTn(e.target.value)} placeholder="Nome do tecido"/>
                <input className={`${inp} flex-1 min-w-[100px]`} value={tf} onChange={e=>setTf(e.target.value)} placeholder="Fornecedor"/>
                <input className={`${inp} flex-1 min-w-[100px]`} value={tc} onChange={e=>setTc(e.target.value)} placeholder="Composição"/>
                <input className={`${inp} w-20`} value={tp} onChange={e=>setTp(e.target.value)} placeholder="Preço"/>
              </div>
              <div className="flex gap-2 mb-5 flex-wrap items-center">
                <input className={`${inp} w-20`} value={to}  onChange={e=>{const v=e.target.value;setTo(v);const g=ozParaGramatura(v);if(g!==null)setTg(String(g));}}  placeholder="OZ"          title="Peso em onças por jarda quadrada — preenche a gramatura automaticamente"/>
                <input className={`${inp} w-28`} value={tg}  onChange={e=>setTg(e.target.value)}  placeholder="Gramatura"   title="Gramatura (g/m²)"/>
                <input className={`${inp} w-28`} value={tl}  onChange={e=>setTl(e.target.value)}  placeholder="Largura"     title="Largura (metros)"/>
                <input className={`${inp} w-32`} value={tel} onChange={e=>setTel(e.target.value)} placeholder="Enc. larg./trama" title="Encolhimento na largura (sentido da trama), em %"/>
                <input className={`${inp} w-32`} value={tea} onChange={e=>setTea(e.target.value)} placeholder="Enc. alt./urdume"  title="Encolhimento na altura (sentido do urdume), em %"/>
                <input className={`${inp} w-28`} value={tr}  onChange={e=>setTr(e.target.value)}  placeholder="Rendimento"  title="Rendimento (m/kg)"/>
                <button onClick={addT} className={btn}>Adicionar</button>
              </div>

              <div className="mb-3">
                <input type="text" aria-label="Buscar tecido por nome, fornecedor ou composição" value={st} onChange={e=>setSt(e.target.value)} placeholder="Buscar tecido..." className={`${inp} w-full`}/>
              </div>

              <div className="border border-[var(--separator)] rounded-xl overflow-hidden overflow-x-auto">
                <table className="plm-table"><thead><tr>
                  <th className="w-16 px-3 text-center">Foto</th>
                  <th className="px-4">Nome</th><th>Fornecedor</th><th>Composição</th>
                  <th className="text-right">Preço</th>
                  <th className="text-center w-20" title="Peso em onças por jarda quadrada — preenche a gramatura automaticamente">OZ</th>
                  <th className="text-center w-24" title="Gramatura em gramas por metro quadrado — preenchida pelo OZ, ou digitada direto">Gram. (g/m²)</th>
                  <th className="text-center w-24" title="Largura útil em metros">Largura (m)</th>
                  <th className="text-center w-28" title="Encolhimento na largura (sentido da trama), em %">Enc. larg./trama (%)</th>
                  <th className="text-center w-28" title="Encolhimento na altura (sentido do urdume), em %">Enc. alt./urdume (%)</th>
                  <th className="text-center w-24" title="Rendimento em metros por quilo">Rend. (m/kg)</th>
                  <th className="w-10"></th>
                </tr></thead>
                <tbody>{ft.map((t:any,i:number)=>{
                  const campoNum=(campo:string,titulo:string)=>(
                    <td className="px-1 py-1">
                      {/* text + inputMode decimal: com type="number" o navegador
                          rejeita a vírgula e devolve "", apagando o que a pessoa
                          digitou como "1,60". A conversão fica no salvamento. */}
                      <input type="text" inputMode="decimal" title={titulo}
                        key={`${campo}-${t.nome}-${t[campo]??""}`} defaultValue={t[campo]??""} placeholder="—"
                        className="w-full text-[12px] text-center tabnum border border-transparent rounded-lg px-1.5 py-1 outline-none bg-transparent hover:border-[var(--separator-opaque)] focus:border-[var(--system-blue)] focus:bg-[var(--bg-primary)] transition-all"
                        onBlur={e=>{const v=e.target.value.trim();if(v!==String(t[campo]??""))saveTec(t.nome,{[campo]:v});}}/>
                    </td>
                  );
                  return (
                  <tr key={t.nome||i}>
                    {/* ── Foto ── */}
                    <td className="text-center px-2 py-1.5">
                      {tecImgUploading===t.nome
                        ? <div className="w-12 h-12 rounded border border-[var(--separator)] mx-auto flex items-center justify-center text-[10px] text-[var(--label-tertiary)]">...</div>
                        : t.imagem
                          ? <div className="relative inline-block group">
                              <img src={t.imagem} alt={t.nome} onClick={()=>triggerTecImg(t.nome)} className="w-12 h-12 object-cover rounded border border-[var(--separator)] cursor-pointer hover:opacity-80 transition-opacity" title="Clique para trocar"/>
                              <button onClick={e=>{e.stopPropagation();remTecImg(t.nome,t.imagem);}} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" title="Remover foto">×</button>
                            </div>
                          : <button onClick={()=>triggerTecImg(t.nome)} className="w-12 h-12 border-2 border-dashed border-[var(--separator-opaque)] rounded-lg flex flex-col items-center justify-center gap-0.5 text-[var(--label-quaternary)] hover:border-[var(--system-blue)] hover:text-[var(--system-blue)] transition-colors mx-auto" title="Adicionar foto">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                              <span className="text-[8px] font-medium leading-none">foto</span>
                            </button>}
                    </td>
                    <td className="px-2 py-1">
                      <input title="Nome do tecido — a troca é propagada para os SKUs e fichas que usam ele"
                        key={`nome-${t.nome}`} defaultValue={t.nome}
                        disabled={renomeando===t.nome}
                        className="w-full text-[13px] font-medium uppercase border border-transparent rounded-lg px-2 py-1 outline-none bg-transparent hover:border-[var(--separator-opaque)] focus:border-[var(--system-blue)] focus:bg-[var(--bg-primary)] transition-all disabled:opacity-50"
                        onBlur={e=>renomearTec(t.nome,e.currentTarget)}
                        onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();if(e.key==="Escape"){e.currentTarget.value=t.nome;e.currentTarget.blur();}}}/>
                    </td>
                    <td className="px-2 py-1">
                      <input title="Fornecedor do tecido" placeholder="—"
                        key={`forn-${t.nome}-${t.forn??""}`} defaultValue={t.forn??""}
                        className="w-full text-[12px] uppercase border border-transparent rounded-lg px-2 py-1 outline-none bg-transparent hover:border-[var(--separator-opaque)] focus:border-[var(--system-blue)] focus:bg-[var(--bg-primary)] transition-all"
                        onBlur={e=>{const v=e.target.value.trim().toUpperCase();if(v!==(t.forn??""))saveTec(t.nome,{forn:v});}}/>
                    </td>
                    <td className="px-2 py-1">
                      <input title="Composição do tecido" placeholder="—"
                        key={`comp-${t.nome}-${t.comp??""}`} defaultValue={t.comp??""}
                        className="w-full text-[12px] text-[var(--label-secondary)] uppercase border border-transparent rounded-lg px-2 py-1 outline-none bg-transparent hover:border-[var(--separator-opaque)] focus:border-[var(--system-blue)] focus:bg-[var(--bg-primary)] transition-all"
                        onBlur={e=>{const v=e.target.value.trim().toUpperCase();if(v!==(t.comp??""))saveTec(t.nome,{comp:v});}}/>
                    </td>
                    <td className="px-1 py-1">
                      <input type="text" inputMode="decimal" title="Preço do tecido (R$)"
                        className="w-full text-[12px] text-right tabnum border border-transparent rounded-lg px-1.5 py-1 outline-none bg-transparent hover:border-[var(--separator-opaque)] focus:border-[var(--system-blue)] focus:bg-[var(--bg-primary)] transition-all"
                        key={`preco-${t.nome}-${t.preco??""}`} defaultValue={t.preco||""} placeholder="0,00"
                        onBlur={e=>{const v=parseFloat(e.target.value.replace(",","."))||0;if(v!==(t.preco||0))saveTec(t.nome,{preco:v});}}/>
                    </td>
                    <td className="px-1 py-1">
                      {/* OZ preenche a gramatura sozinho (1 oz/yd² ≈ 33,91 g/m²) — os dois
                          são salvos juntos para não perder o número redondo que a pessoa digitou */}
                      <input type="text" inputMode="decimal" title="Peso em onças por jarda quadrada — preenche a gramatura automaticamente"
                        key={`oz-${t.nome}-${t.oz??""}`} defaultValue={t.oz??""} placeholder="—"
                        className="w-full text-[12px] text-center tabnum border border-transparent rounded-lg px-1.5 py-1 outline-none bg-transparent hover:border-[var(--separator-opaque)] focus:border-[var(--system-blue)] focus:bg-[var(--bg-primary)] transition-all"
                        onBlur={e=>{
                          const v=e.target.value.trim();
                          if(v===String(t.oz??""))return;
                          const g=ozParaGramatura(v);
                          saveTec(t.nome,g!==null?{oz:v,gramatura:g}:{oz:v});
                        }}/>
                    </td>
                    {campoNum("gramatura","Gramatura (g/m²) — preenchida pelo OZ, ou digitada direto")}
                    {campoNum("largura","Largura (metros)")}
                    {campoNum("enc_largura","Encolhimento na largura (sentido da trama), em %")}
                    {campoNum("enc_altura","Encolhimento na altura (sentido do urdume), em %")}
                    {campoNum("rendimento","Rendimento (m/kg)")}
                    <td className="text-center"><button onClick={()=>remT(t.nome)} className="text-[var(--label-quaternary)] hover:text-[var(--system-red)] transition-colors">×</button></td>
                  </tr>
                );})}</tbody></table>
              </div>
              <p className="text-[11px] text-[var(--label-tertiary)] mt-2">{ft.length} de {tecidos.length} · clique em qualquer campo para editar (inclusive o nome) — salva ao sair</p>
            </>)}
          </div>
        </div>
      </div>
    </div>
  );
}
