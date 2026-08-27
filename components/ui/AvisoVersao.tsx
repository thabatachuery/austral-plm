"use client";

// Aviso de versão nova.
//
// O PLM é uma aba que fica aberta o dia inteiro. Quando sai um deploy, o
// JavaScript já carregado continua rodando: a pessoa não vê a correção e não
// tem como saber que precisa recarregar (foi o que aconteceu no login da Livia).
//
// Aqui a gente guarda a versão que estava no ar quando a aba abriu e compara de
// tempo em tempo — e sempre que a aba volta pro primeiro plano, que é quando
// normalmente já passou um deploy. Se mudou, aparece o aviso.
//
// Não recarrega sozinho de propósito: a ficha pode estar aberta com edição em
// andamento, e um reload no meio da digitação perderia o que não salvou.

import { useEffect, useRef, useState } from "react";

const INTERVALO_MS = 3 * 60 * 1000;

export default function AvisoVersao() {
  const versaoInicial = useRef<string | null>(null);
  const [novaVersao, setNovaVersao] = useState(false);

  useEffect(() => {
    let vivo = true;

    // `forcar` roda a checagem mesmo com a aba oculta. Usado no mount (a aba
    // pode abrir em segundo plano, e sem registrar a versão base a comparação
    // nunca acontece) e quando a aba volta pro primeiro plano. A checagem
    // periódica é a única que pula aba oculta, pra não ficar batendo à toa.
    const conferir = async (forcar = false) => {
      if (!vivo) return;
      if (!forcar && document.hidden) return;
      try {
        const r = await fetch("/api/versao", { cache: "no-store" });
        if (!r.ok) return;
        const { versao } = await r.json();
        if (!versao || !vivo) return;
        // Em desenvolvimento a versão é sempre "local" — nunca acusa nada.
        if (versaoInicial.current === null) { versaoInicial.current = versao; return; }
        if (versao !== versaoInicial.current) setNovaVersao(true);
      } catch {
        // Sem rede ou deploy em andamento: tenta de novo no próximo ciclo.
      }
    };

    conferir(true);
    const timer = setInterval(() => conferir(), INTERVALO_MS);
    const aoVoltar = () => { if (!document.hidden) conferir(true); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      vivo = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);

  if (!novaVersao) return null;

  return (
    <div
      role="status"
      className="fixed left-1/2 -translate-x-1/2 bottom-5 z-[100000] flex items-center gap-3 px-4 py-2.5 rounded-full shadow-lg border border-[var(--separator-opaque)]"
      style={{ background: "var(--bg-primary)" }}
    >
      <span className="w-2 h-2 rounded-full bg-[var(--system-blue)] animate-pulse flex-shrink-0" />
      <span className="text-[13px] text-[var(--label-primary)]">
        Tem uma versão nova do PLM.
      </span>
      <button
        onClick={() => window.location.reload()}
        className="apple-btn-primary text-[12px] !py-1.5 !px-3 whitespace-nowrap"
      >
        Atualizar
      </button>
    </div>
  );
}
