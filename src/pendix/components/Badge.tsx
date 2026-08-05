export type BadgeTone = 'purple' | 'blue' | 'yellow' | 'emerald' | 'green' | 'red' | 'gray' | 'orange';

const TONE_CLASSES: Record<BadgeTone, string> = {
  purple:  'bg-purple-500/15 text-purple-400 border-purple-500/20',
  blue:    'bg-blue-500/15 text-blue-400 border-blue-500/20',
  yellow:  'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  green:   'bg-green-500/15 text-green-400 border-green-500/20',
  red:     'bg-red-500/15 text-red-400 border-red-500/20',
  gray:    'bg-gray-500/15 text-gray-400 border-gray-500/20',
  orange:  'bg-orange-500/15 text-orange-400 border-orange-500/20',
};

export default function Badge({
  tone = 'gray', icon: Icon, children,
}: { tone?: BadgeTone; icon?: React.ComponentType<any>; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${TONE_CLASSES[tone]}`}>
      {Icon && <Icon size={11} />}
      {children}
    </span>
  );
}
