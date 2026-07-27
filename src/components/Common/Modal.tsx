import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'xl'
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
  }[maxWidth];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-4 md:p-6" role="presentation">
      {/* Backdrop click to close */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* Floating Card Modal Container */}
      <div className={`relative z-10 flex max-h-[92vh] w-full ${maxWidthClasses} flex-col overflow-hidden rounded-[var(--itred-radius-lg)] border border-[var(--itred-color-border)] bg-white shadow-[var(--itred-shadow-floating)]`} role="dialog" aria-modal="true" aria-labelledby="itred-dialog-title">
        
        {/* Card Header with Matt Charcoal Grey background and vibrant Orange accent border */}
        <div className="flex items-center justify-between border-b-2 border-[var(--itred-color-primary)] bg-[var(--itred-color-charcoal)] px-5 py-4 text-white sm:px-6">
          <div>
            <h2 id="itred-dialog-title" className="flex items-center gap-2 text-base font-bold tracking-tight text-white sm:text-lg">
              <span className="inline-block size-1.5 bg-[var(--itred-color-primary)]"></span>
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs sm:text-sm text-slate-300 mt-0.5 font-normal">{subtitle}</p>
            )}
          </div>
          <Button
            onClick={onClose}
            variant="quiet"
            size="sm"
            className="min-h-8 border-white/20 bg-transparent px-2 text-slate-200 shadow-none hover:bg-white/10 hover:text-white"
            aria-label="Close modal"
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* Card Body - Clean White with crisp typography */}
        <div className="p-4 sm:p-6 md:p-8 overflow-y-auto bg-white text-slate-800 text-xs sm:text-sm md:text-base space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
};
