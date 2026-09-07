import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none px-4">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />,
    info: <Info className="w-5 h-5 text-sky-500 shrink-0" />,
  };

  const bgStyles = {
    success: 'bg-slate-900/95 border-emerald-500/40 text-slate-100 shadow-emerald-500/10',
    error: 'bg-slate-900/95 border-rose-500/40 text-slate-100 shadow-rose-500/10',
    info: 'bg-slate-900/95 border-sky-500/40 text-slate-100 shadow-sky-500/10',
  };

  return (
    <div
      className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-xl border shadow-xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-3 ${bgStyles[toast.type]}`}
    >
      <div className="flex items-center gap-3">
        {icons[toast.type]}
        <span className="text-sm font-medium leading-snug">{toast.message}</span>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors ml-3"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
