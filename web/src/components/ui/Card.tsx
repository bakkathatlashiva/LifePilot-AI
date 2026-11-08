import React from 'react';
import { cn } from '../../lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  padding?: 'sm' | 'md' | 'lg' | 'none';
}

export function Card({ children, className, hover = false, onClick, padding = 'md' }: CardProps) {
  const paddings = { none: '', sm: 'p-3', md: 'p-3.5 sm:p-5', lg: 'p-4 sm:p-6' };
  return (
    <div
      className={cn(
        'bg-dark-900 border border-white/8 rounded-2xl shadow-lg',
        paddings[padding],
        hover && 'transition-all duration-200 hover:border-purple-500/30 hover:shadow-purple-500/10 hover:shadow-xl cursor-pointer',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, action, icon, className }: CardHeaderProps) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4', className)}>
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-purple-600/20 flex items-center justify-center text-purple-400 flex-shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-slate-100 font-semibold text-sm sm:text-base truncate">{title}</h3>
          {subtitle && <p className="text-slate-500 text-xs mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="self-start sm:self-auto flex-shrink-0">{action}</div>}
    </div>
  );
}
