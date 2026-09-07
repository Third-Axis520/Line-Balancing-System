import React, { useState } from 'react';
import { X, Smartphone, Download, Copy, Check, ExternalLink, Presentation } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { PPTItem } from '../types';

interface QRCodeModalProps {
  ppt: PPTItem | null;
  onClose: () => void;
  onDownload: (ppt: PPTItem) => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ ppt, onClose, onDownload }) => {
  const [copied, setCopied] = useState(false);
  const [qrType, setQrType] = useState<'view' | 'download'>('view');

  if (!ppt) return null;

  // Build full URLs
  const viewUrl = `${window.location.origin}/?view=${ppt.id}`;
  const downloadUrl = `${window.location.origin}${ppt.fileUrl}`;
  const activeUrl = qrType === 'view' ? viewUrl : downloadUrl;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(viewUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = viewUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl shadow-2xl p-5 sm:p-6 text-slate-100 relative max-h-[95vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-amber-400 mb-2">
          <Smartphone className="w-5 h-5" />
          <h3 className="font-bold text-base text-white">手机扫码查阅 / 下载</h3>
        </div>

        <p className="text-xs text-slate-400 mb-3 leading-relaxed">
          现场员工可用微信、钉钉或手机相机扫码，直接在手机上翻页查看 PPT 或保存到本地。
        </p>

        {/* Tab switch between View URL and Download URL */}
        <div className="flex rounded-xl bg-slate-950 p-1 mb-3 border border-slate-800 text-xs">
          <button
            onClick={() => setQrType('view')}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 ${
              qrType === 'view'
                ? 'bg-orange-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Presentation className="w-3.5 h-3.5" />
            <span>手机在线翻页查阅</span>
          </button>
          <button
            onClick={() => setQrType('download')}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 ${
              qrType === 'download'
                ? 'bg-orange-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>直接下载文件</span>
          </button>
        </div>

        {/* QR Code Container */}
        <div className="bg-white p-3.5 rounded-2xl flex flex-col items-center justify-center mx-auto w-fit shadow-inner">
          <QRCodeSVG
            value={activeUrl}
            size={180}
            level="M"
            includeMargin={true}
          />
          <span className="text-[11px] font-bold text-slate-700 mt-1">
            {qrType === 'view' ? '扫码直接在手机翻页浏览' : '扫码直接下载 PPT'}
          </span>
        </div>

        {/* PPT Info card */}
        <div className="mt-3.5 p-3 bg-slate-800/80 rounded-xl border border-slate-700/80 text-xs space-y-1">
          <p className="font-semibold text-slate-200 truncate">{ppt.title}</p>
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>大小: {(ppt.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
            <span>包含: {ppt.slideCount || ppt.slides?.length || 1} 页幻灯片</span>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="mt-4 space-y-2">
          <button
            onClick={handleCopyLink}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-all active:scale-95"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">已复制手机链接，可发微信/钉钉群</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-amber-400" />
                <span>复制手机查阅链接 (发微信/钉钉群)</span>
              </>
            )}
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => {
                window.open(viewUrl, '_blank');
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>新窗口预览</span>
            </button>

            <button
              onClick={() => {
                onDownload(ppt);
                onClose();
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-orange-600/20 transition-all active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span>直接下载</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
