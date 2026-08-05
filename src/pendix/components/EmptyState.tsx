import type { ComponentType } from 'react';

export default function EmptyState({
  icon: Icon, title, description, action, isDark,
}: {
  icon?: ComponentType<any>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  isDark: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {Icon && (
        <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center mb-4 ${isDark ? 'bg-white/5 border-white/10 text-gray-600' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
          <Icon size={20} />
        </div>
      )}
      <p className={`text-sm font-bold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{title}</p>
      {description && <p className={`text-xs mt-1.5 max-w-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
