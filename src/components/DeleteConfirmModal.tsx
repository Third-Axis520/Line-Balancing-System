import React, { useState } from 'react';
import { Trash2, AlertTriangle, Loader2, X } from 'lucide-react';
import { PPTItem } from '../types';

interface DeleteConfirmModalProps {
  ppt: PPTItem;
  onClose: () => void;
  onConfirm: (ppt: PPTItem) => Promise<void>;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  ppt,
  onClose,
  onConfirm,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleConfirm = async () => {
    try {
      setIsDeleting(true);
      await onConfirm(ppt);
      onClose();
    } catch {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-rose-500/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">确认删除课件？</h3>
              <p className="text-xs text-slate-400">此操作不可撤销</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-300 leading-relaxed">
            您确定要彻底删除以下生产线平衡改善案例课件吗？
          </p>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
            <p className="text-sm font-semibold text-white break-all">
              《{ppt.title}》
            </p>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>文件大小: {formatBytes(ppt.fileSize)}</span>
              <span>•</span>
              <span>{ppt.slideCount || 1} 页幻灯片</span>
              <span>•</span>
              <span>发布人: {ppt.uploader}</span>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-950/20 border border-rose-800/30 text-rose-300 text-xs">
            <Trash2 className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span>删除后，该PPT的原始文件、解析幻灯片及所有内容图解将被永久移除，现场员工将无法再下载查阅。</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            取消
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 flex items-center gap-2 shadow-lg shadow-rose-600/20 transition-colors disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>正在删除...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>确认彻底删除</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
