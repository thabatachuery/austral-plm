// Filtro de coleção que entende clássicos: a ref está na coleção quando a
// coleção do produto bate OU quando ela tem ficha naquela temporada.
// Ex.: INVERNO 27 → produtos INVERNO 27 + clássicos com temporada INVERNO 27.

export type TemporadasPorRef = Record<string, string[]>;

export function naColecao(row: { ref?: string; colecao?: string }, colecao: string, temporadas: TemporadasPorRef = {}): boolean {
  return row.colecao === colecao || (temporadas[row.ref || ""] || []).includes(colecao);
}

/** Coleções para os botões/selects de filtro: as dos produtos + as temporadas dos clássicos. */
export function colecoesComTemporadas(rows: { ref?: string; colecao?: string }[], temporadas: TemporadasPorRef = {}): string[] {
  const refs = new Set(rows.map(r => r.ref));
  const todas = new Set<string>();
  rows.forEach(r => { if (r.colecao) todas.add(r.colecao); });
  Object.entries(temporadas).forEach(([ref, ts]) => { if (refs.has(ref)) ts.forEach(t => todas.add(t)); });
  return Array.from(todas).sort((a, b) => b.localeCompare(a, "pt-BR", { numeric: true }));
}
