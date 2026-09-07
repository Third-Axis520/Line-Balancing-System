import React from 'react';
import { 
  Download, 
  Eye, 
  QrCode, 
  Pin, 
  Edit3, 
  Trash2, 
  Image as ImageIcon, 
  FileText,
  HardDrive
} from 'lucide-react';
import { PPTItem } from '../types';

interface PPTCardProps {
  ppt: PPTItem;
  isPlanner: boolean;
  onView: (ppt: PPTItem) => void;
  onDownload: (ppt: PPTItem) => void;
  onOpenQRCode: (ppt: PPTItem) => void;
  onEdit?: (ppt: PPTItem) => void;
  onDelete?: (ppt: PPTItem) => void;
}

export const PPTCard: React.FC<PPTCardProps> = ({
  ppt,
  isPlanner,
  onView,
  onDownload,
  onOpenQRCode,
  onEdit,
  onDelete,
}) => {
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const coverImage = ppt.images && ppt.images.length > 0 ? ppt.images[0] : null;

  return (
    <div
      className={`group relative bg-slate-900/90 hover:bg-slate-800/80 rounded-2xl border transition-all duration-300 flex flex-col overflow-hidden shadow-lg hover:shadow-2xl hover:shadow-orange-500/5 ${
        ppt.isPinned 
          ? 'border-amber-500/40 ring-1 ring-amber-500/20' 
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Pinned Ribbon Badge */}
      {ppt.isPinned && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold shadow-md">
          <Pin className="w-3 h-3 fill-current" />
          <span>置顶推荐</span>
        </div>
      )}

      {/* Visual Image / Slide Preview Banner */}
      <div 
        onClick={() => onView(ppt)}
        className="relative w-full aspect-[16/9] bg-slate-950 overflow-hidden cursor-pointer group-hover:brightness-105 transition-all"
      >
        {coverImage ? (
          <img
            src={coverImage}
            alt={ppt.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600">
            <FileText className="w-12 h-12" />
          </div>
        )}

        {/* Floating Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-70" />

        {/* Visual Counts & Mobile Hint */}
        <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-xs font-medium pointer-events-none">
          <span className="px-2 py-0.5 rounded-md bg-slate-900/85 backdrop-blur-sm text-slate-200 border border-slate-700/60 flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-orange-400" />
            <span>共 {ppt.slideCount || ppt.slides?.length || ppt.images?.length || 1} 页</span>
          </span>
          <span className="sm:hidden px-2 py-0.5 rounded-md bg-orange-600/90 text-white text-[10px] font-bold shadow-sm flex items-center gap-1">
            <Eye className="w-3 h-3" />
            <span>点击翻页预览</span>
          </span>
        </div>

        {/* Hover quick preview prompt (Desktop) */}
        <div className="hidden sm:flex absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 items-center justify-center transition-opacity">
          <span className="px-3.5 py-1.5 rounded-xl bg-white/95 text-slate-900 text-xs font-bold shadow-lg flex items-center gap-1.5 transform scale-95 group-hover:scale-100 transition-transform">
            <Eye className="w-3.5 h-3.5 text-orange-600" />
            点击预览PPT原版内容
          </span>
        </div>
      </div>

      {/* Card Content Body */}
      <div className="p-3.5 sm:p-5 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-1.5">
          {/* Title */}
          <h3 
            onClick={() => onView(ppt)}
            className="text-sm sm:text-base font-bold text-white group-hover:text-amber-400 transition-colors cursor-pointer line-clamp-2 leading-snug active:text-orange-400"
            title={ppt.title}
          >
            {ppt.title}
          </h3>

          {/* Description snippet */}
          <p className="text-[11px] sm:text-xs text-slate-400 line-clamp-2 leading-relaxed">
            {ppt.description || '暂无说明'}
          </p>
        </div>

        {/* Meta Stats Row */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] sm:text-xs text-slate-400">
          <div className="flex items-center gap-1 text-slate-300 font-medium">
            <HardDrive className="w-3.5 h-3.5 text-amber-400/80" />
            <span>{formatBytes(ppt.fileSize)}</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span title="下载次数">
              已下载 <strong className="text-emerald-400">{ppt.downloadCount || 0}</strong> 次
            </span>
            <span className="text-slate-600">·</span>
            <span title="上传/更新时间">
              {ppt.updateDate ? ppt.updateDate.split(' ')[0] : ppt.uploadDate.split(' ')[0]}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-1 flex items-center gap-2">
          {/* Main Download Button for Staff */}
          <button
            id={`btn-download-${ppt.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onDownload(ppt);
            }}
            className="flex-1 min-h-[42px] sm:min-h-[40px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-xs sm:text-sm font-bold shadow-md shadow-orange-600/20 transition-all active:scale-95"
            title="点击直接下载该 PPT 文件到本地"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>下载 PPT</span>
          </button>

          {/* Picture preview button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onView(ppt);
            }}
            className="min-h-[42px] min-w-[42px] sm:min-h-[40px] sm:min-w-[40px] p-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 transition-colors flex items-center justify-center active:scale-95"
            title="在线全版翻页预览"
          >
            <Eye className="w-4 h-4" />
          </button>

          {/* QR Code button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenQRCode(ppt);
            }}
            className="min-h-[42px] min-w-[42px] sm:min-h-[40px] sm:min-w-[40px] p-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-amber-400 border border-slate-700 transition-colors flex items-center justify-center active:scale-95"
            title="手机扫码在手机上查阅与分享"
          >
            <QrCode className="w-4 h-4" />
          </button>

          {/* Planner privileged operations */}
          {isPlanner && (
            <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
              {onEdit && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(ppt);
                  }}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 border border-slate-700 transition-colors"
                  title="企划修改此PPT信息"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(ppt);
                  }}
                  className="p-2 rounded-lg bg-rose-950/30 hover:bg-rose-900/50 text-rose-400 border border-rose-800/30 transition-colors"
                  title="企划删除此课件"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
