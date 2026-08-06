export type PendixLogoVariant = 'purple' | 'black' | 'white' | 'color';

interface PendixLogoProps {
  variant?: PendixLogoVariant;
  size?: number;
  className?: string;
}

// Ícone da marca Pendix. `variant` controla a cor do traço — 'color' usa o
// degradê azul/verde original da arte; as outras são silhuetas sólidas.
export default function PendixLogo({ variant = 'purple', size = 40, className }: PendixLogoProps) {
  return (
    <img
      src={`/pendix/logo-icon-${variant}.png`}
      width={size}
      height={size}
      alt="Pendix"
      className={className}
    />
  );
}
