interface PendixWordmarkProps {
  size?: number;
  color?: string;
  className?: string;
}

// Wordmark "Pendix": Baloo 2 ExtraBold, com espaçamento entre letras, "x"
// final em degradê preto→roxo. `color` é branco por padrão porque as telas
// atuais têm fundo escuro — o #091426 do spec original só funciona sobre
// fundo claro.
export default function PendixWordmark({ size = 40, color = '#ffffff', className }: PendixWordmarkProps) {
  return (
    <span
      className={className}
      style={{
        fontFamily: "'Baloo 2'",
        fontWeight: 800,
        letterSpacing: '2px',
        color,
        fontSize: size,
        lineHeight: 1,
      }}
    >
      Pendi
      <span
        style={{
          backgroundImage: 'linear-gradient(135deg, #000000, #9333ea)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        x
      </span>
    </span>
  );
}
