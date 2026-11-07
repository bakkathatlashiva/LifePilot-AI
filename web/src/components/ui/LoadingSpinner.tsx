import React from 'react';
import { cn } from '../../lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

const sizes = { sm: 'w-4 h-4 border-2', md: 'w-8 h-8 border-2', lg: 'w-12 h-12 border-3' };

export function LoadingSpinner({ size = 'md', className, label }: LoadingSpinnerProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3', className)} role="status" aria-label={label ?? 'Loading'}>
      <div
        className={cn(
          'rounded-full border-purple-500/30 border-t-purple-500 animate-spin',
          sizes[size]
        )}
      />
      {label && <p className="text-slate-500 text-sm">{label}</p>}
    </div>
  );
}

export function PageLoader({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center">
      <LoadingSpinner size="lg" label={label} />
    </div>
  );
}
