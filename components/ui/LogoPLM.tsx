// Símbolo da identidade AUSTRAL PLM by AusTab: losango (tecido) atravessado
// por um alfinete neon. Desenhado em SVG para ficar nítido em qualquer tamanho.
export default function LogoPLM({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" rx="28" fill="#16171D" />
      <path d="M64 36 L57 43 M43 57 L31 69" stroke="#D7F36B" strokeWidth="3.8" strokeLinecap="round" fill="none" />
      <rect x="29.5" y="29.5" width="41" height="41" rx="11" transform="rotate(45 50 50)" fill="none" stroke="#FAF8F5" strokeWidth="6" />
      <circle cx="70" cy="30" r="9" fill="#D7F36B" />
    </svg>
  );
}
