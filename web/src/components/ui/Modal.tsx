import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export function Modal({ isOpen, onClose, title, children, size = 'md', footer }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        className={cn(
          'relative w-full bg-dark-900 border border-white/10 rounded-2xl shadow-2xl animate-slide-up',
          'flex flex-col max-h-[90dvh]',
          sizes[size]
        )}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/8">
            <h2 id="modal-title" className="text-slate-100 font-semibold text-base sm:text-lg pr-4">
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-100 hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        {!title && (
          <button
            className="absolute top-3 right-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-white/10 text-slate-400 hover:text-slate-200 transition"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="p-4 sm:p-5 border-t border-white/8 flex flex-wrap justify-end gap-2.5">{footer}</div>
        )}
      </div>
    </div>
  );
}
