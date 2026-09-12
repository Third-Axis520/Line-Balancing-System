import React, { useState, useRef } from 'react';
import { 
  X, 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Image as ImageIcon,
  Layers,
  Sparkles
} from 'lucide-react';
import { beginLogin, getAccessToken } from '../auth/api';

interface UploadModalProps {
  onClose: () => void;
  onSuccess: (message: string) => void;
}

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const DUPLICATE_CASE_ERROR = '案例名称已存在，请选择替换现有案例或修改名称';

export const UploadModal: React.FC<UploadModalProps> = ({ onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPinned, setIsPinned] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [conflict, setConflict] = useState<{ id: string; title: string } | null>(null);
  const [replacementIntent, setReplacementIntent] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const replacementIntentRef = useRef(false);

  const resetReplacementIntent = () => {
    replacementIntentRef.current = false;
    setReplacementIntent(false);
  };

  const validateFile = (selectedFile: File) => {
    if (!/\.(ppt|pptx)$/i.test(selectedFile.name)) {
      setErrorMessage('仅支持上传 .pptx 或 .ppt 格式的幻灯片文件');
      return false;
    }
    if (selectedFile.size > MAX_UPLOAD_BYTES) {
      setErrorMessage('上传文件大小不能超过 200 MB');
      return false;
    }
    return true;
  };

  const selectFile = (selectedFile: File) => {
    if (!validateFile(selectedFile)) return;

    setFile(selectedFile);
    if (!title) {
      setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
    }
    setErrorMessage('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      selectFile(e.target.files[0]);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      selectFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e?: React.FormEvent, submitReplacement = false) => {
    e?.preventDefault();
    if (isUploading) return;
    if (!file) {
      resetReplacementIntent();
      setErrorMessage('请先选择要上传的 PPT 文件');
      return;
    }
    if (!title.trim()) {
      resetReplacementIntent();
      setErrorMessage('请输入 PPT 标题');
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      resetReplacementIntent();
      return;
    }

    const shouldReplace = submitReplacement && replacementIntentRef.current && conflict;

    setIsUploading(true);
    setUploadProgress(10);
    setErrorMessage('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title.trim());
    formData.append('description', description.trim());
    formData.append('isPinned', String(isPinned));
    if (shouldReplace) {
      formData.append('replaceCaseId', shouldReplace.id);
    }

    // Using XMLHttpRequest to provide real upload progress for large image PPTs
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/ppts');
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 90);
        setUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      setIsUploading(false);
      if (xhr.status === 401) {
        resetReplacementIntent();
        void beginLogin();
        return;
      }
      try {
        const res = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && res.success) {
          resetReplacementIntent();
          onSuccess(res.message || 'PPT 上传并解析完成！');
          onClose();
        } else if (
          xhr.status === 409 &&
          res?.error === DUPLICATE_CASE_ERROR &&
          typeof res?.conflict?.id === 'string' &&
          typeof res?.conflict?.title === 'string'
        ) {
          resetReplacementIntent();
          setConflict({ id: res.conflict.id, title: res.conflict.title });
        } else {
          resetReplacementIntent();
          setErrorMessage(res.error || '上传失败，请稍后重试');
        }
      } catch {
        resetReplacementIntent();
        setErrorMessage('服务器响应异常');
      }
    };

    xhr.onerror = () => {
      setIsUploading(false);
      resetReplacementIntent();
      setErrorMessage('网络连接错误，无法完成上传');
    };

    xhr.send(formData);
  };

  const formatFileSize = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleReplaceExisting = () => {
    replacementIntentRef.current = true;
    setReplacementIntent(true);
    void handleSubmit(undefined, true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl p-4 sm:p-7 text-slate-100 relative my-auto max-h-[95vh] overflow-y-auto">
        <button
          onClick={onClose}
          disabled={isUploading}
          className="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-4 sm:mb-5 pr-8">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center border border-orange-500/30 shrink-0">
            <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white">企划发布现场 PPT 课件</h3>
            <p className="text-[11px] sm:text-xs text-slate-400">
              支持上传含大量高清效果图、施工图、动线图的演示文稿 (最高支持 200MB)
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/50 border border-rose-800/50 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
          {/* Drag & Drop File Zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-4 sm:p-5 text-center cursor-pointer transition-all active:scale-[0.99] ${
              file
                ? 'border-emerald-500/60 bg-emerald-950/15'
                : 'border-slate-700 hover:border-orange-500/60 bg-slate-900/60 hover:bg-slate-800/60'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
              className="hidden"
            />

            {file ? (
              <div className="flex items-center justify-center gap-2.5 sm:gap-3">
                <FileSpreadsheet className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-400 shrink-0" />
                <div className="text-left min-w-0 flex-1">
                  <p className="font-semibold text-slate-200 truncate">{file.name}</p>
                  <p className="text-[11px] sm:text-xs text-emerald-400 flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    已就绪 · 大小: {formatFileSize(file.size)}
                  </p>
                </div>
                <span className="text-xs text-slate-400 hover:text-slate-200 underline shrink-0">
                  更换
                </span>
              </div>
            ) : (
              <div className="space-y-1.5 py-1 sm:py-2">
                <Upload className="w-7 h-7 sm:w-8 sm:h-8 text-orange-400 mx-auto opacity-80" />
                <p className="font-semibold text-slate-200 text-xs sm:text-sm">
                  点击选择或将 PPT 文件拖拽到此处
                </p>
                <p className="text-[11px] sm:text-xs text-slate-400">
                  支持 .pptx、.ppt 格式 · 自动提取全部高清图纸供在线秒级原版预览
                </p>
              </div>
            )}
          </div>

          {/* Form Fields */}
          <div className="space-y-3">
            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                PPT 课件标题 <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                ref={titleInputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：总装车间A线平衡率提升与节拍优化改善案"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-xs sm:text-sm focus:outline-none focus:border-orange-500 transition-colors"
                required
              />
            </div>

            {/* Description / 说明 */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                说明 / 课件导读
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="请输入课件说明与现场平衡改善要点..."
                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-xs sm:text-sm focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>

            {/* Pinned toggle */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="isPinned"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-slate-700 bg-slate-800"
              />
              <label htmlFor="isPinned" className="text-xs font-medium text-slate-300 cursor-pointer">
                置顶推荐该课件（在首页最顶部醒目展示）
              </label>
            </div>
          </div>

          {conflict && (
            <div
              aria-live="polite"
              aria-atomic="true"
              className="rounded-xl border border-amber-500/50 bg-amber-950/30 p-3.5 space-y-3"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <p id="duplicate-case-title" className="font-semibold text-amber-200">发现同名案例</p>
                  <p id="duplicate-case-description" className="mt-1 text-slate-300">
                    已存在案例「{conflict.title}」。是否替换现有案例？
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleReplaceExisting}
                  disabled={isUploading || replacementIntent}
                  className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
                >
                  替换现有案例
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConflict(null);
                    resetReplacementIntent();
                    requestAnimationFrame(() => titleInputRef.current?.focus());
                  }}
                  disabled={isUploading}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors disabled:opacity-50"
                >
                  返回修改名称
                </button>
              </div>
            </div>
          )}

          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-xs text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400" />
                  正在传输并提取 PPT 内部版面物料...
                </span>
                <span className="font-semibold text-orange-400">{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-3 border-t border-slate-800 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-3.5 sm:px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs sm:text-sm font-medium transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isUploading || !file}
              className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-orange-600/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在处理...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>立即发布解析</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
