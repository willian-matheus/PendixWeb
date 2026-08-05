export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <div
      className={`border-2 border-current border-t-transparent rounded-full animate-spin ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function SkeletonRows({ count = 4, isDark, className = 'h-14' }: { count?: number; isDark: boolean; className?: string }) {
  return (
    <div className="p-6 space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`${className} rounded-xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-gray-100'}`} />
      ))}
    </div>
  );
}
