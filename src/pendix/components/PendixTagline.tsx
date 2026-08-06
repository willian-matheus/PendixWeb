interface PendixTaglineProps {
  children: string;
  className?: string;
}

// Poppins Medium, uppercase, letter-spacing 10px.
export default function PendixTagline({ children, className }: PendixTaglineProps) {
  return (
    <p
      className={className}
      style={{
        fontFamily: 'Poppins',
        fontWeight: 500,
        letterSpacing: '10px',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </p>
  );
}
