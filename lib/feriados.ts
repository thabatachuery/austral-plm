// Feriados nacionais (e os pontos facultativos que a empresa não trabalha:
// Carnaval e Corpus Christi). Não contam como dia útil nos prazos.
// Datas móveis calculadas a partir da Páscoa — vale para qualquer ano.

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12));
const mais = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher).
function pascoa(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(y, mes, dia);
}

const cache: Record<number, Map<string, string>> = {};

export function feriadosDoAno(y: number): Map<string, string> {
  if (cache[y]) return cache[y];
  const p = pascoa(y);
  const m = new Map<string, string>([
    [iso(utc(y, 1, 1)), "Confraternização Universal"],
    [iso(mais(p, -48)), "Carnaval"],
    [iso(mais(p, -47)), "Carnaval"],
    [iso(mais(p, -2)), "Sexta-feira Santa"],
    [iso(utc(y, 4, 21)), "Tiradentes"],
    [iso(utc(y, 5, 1)), "Dia do Trabalho"],
    [iso(mais(p, 60)), "Corpus Christi"],
    [iso(utc(y, 9, 7)), "Independência"],
    [iso(utc(y, 10, 12)), "Nossa Senhora Aparecida"],
    [iso(utc(y, 11, 2)), "Finados"],
    [iso(utc(y, 11, 15)), "Proclamação da República"],
    [iso(utc(y, 11, 20)), "Consciência Negra"],
    [iso(utc(y, 12, 25)), "Natal"],
  ]);
  return (cache[y] = m);
}

export const feriado = (isoData: string) => feriadosDoAno(Number(isoData.slice(0, 4))).get(isoData.slice(0, 10)) || "";

// Dia útil: segunda a sexta e não feriado.
export function ehDiaUtil(isoData: string): boolean {
  const w = new Date(isoData.slice(0, 10) + "T12:00:00Z").getUTCDay();
  return w !== 0 && w !== 6 && !feriado(isoData);
}
