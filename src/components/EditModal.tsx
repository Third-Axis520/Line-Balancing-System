import React, { useState } from 'react';
import { X, Edit3, Save, AlertCircle, Loader2 } from 'lucide-react';
import { PPTItem } from '../types';

interface EditModalProps {
  ppt: PPTItem;
  onClose: () => void;
  onSuccess: (updatedPPT: PPTItem, message: string) => void;
  token?: string;
}

export const EditModal: React.FC<EditModalProps> = ({ ppt, onClose, onSuccess, token }) => {
  const [title, setTitle] = useState(ppt.title);
  const [description, setDescription] = useState(ppt.description || '');
  const [isPinned, setIsPinned] = useState(Boolean(ppt.isPinned));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMessage('请输入 PPT 标题');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const res = await fetch(`/api/ppts/${ppt.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          isPinned,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onSuccess(data.ppt, data.message || 'PPT 信息已成功更新');
        onClose();
      } else {
        setErrorMessage(data.error || '更新失败');
      }
    } catch {
      setErrorMessage('网络请求失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl shadow-2xl p-4 sm:p-7 text-slate-100 relative my-auto max-h-[95vh] overflow-y-auto">
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-4 sm:mb-5 pr-8">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center border border-orange-500/30 shrink-0">
            <Edit3 className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white">修改 PPT 信息</h3>
            <p className="text-[11px] sm:text-xs text-slate-400">
              可在此修改课件标题、说明与置顶状态
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/50 border border-rose-800/50 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs sm:text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              PPT 标题 <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-xs sm:text-sm focus:outline-none focus:border-orange-500 transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              说明
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="请输入案例说明..."
              className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-xs sm:text-sm focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="editIsPinned"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-slate-700 bg-slate-800"
            />
            <label htmlFor="editIsPinned" className="text-xs font-medium text-slate-300 cursor-pointer">
              置顶推荐此文稿（在首页顶部醒目展示）
            </label>
          </div>

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 sm:px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs sm:text-sm font-medium transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-orange-600/20 transition-all disabled:opacity-50 active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>保存中...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>保存修改</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
