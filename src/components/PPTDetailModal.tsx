import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Download, 
  QrCode, 
  ChevronLeft, 
  ChevronRight, 
  FileText, 
  Maximize2, 
  Minimize2, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  PanelLeftClose, 
  PanelLeftOpen, 
  Layers, 
  Calendar, 
  User, 
  Play, 
  CheckCircle, 
  Edit3, 
  Trash2, 
  Table as TableIcon,
  Info,
  ExternalLink
} from 'lucide-react';
import { PPTItem, PPTSlide } from '../types';

interface PPTDetailModalProps {
  ppt: PPTItem | null;
  isPlanner: boolean;
  onClose: () => void;
  onDownload: (ppt: PPTItem) => void;
  onOpenQRCode: (ppt: PPTItem) => void;
  onEdit?: (ppt: PPTItem) => void;
  onDelete?: (ppt: PPTItem) => void;
}

export const PPTDetailModal: React.FC<PPTDetailModalProps> = ({
  ppt,
  isPlanner,
  onClose,
  onDownload,
  onOpenQRCode,
  onEdit,
  onDelete,
}) => {
  if (!ppt) return null;

  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [zoomScale, setZoomScale] = useState(1); // 1 = fit, 1.25, 1.5, etc.
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [showNotesDrawer, setShowNotesDrawer] = useState(false);
  const [isFullscreenShow, setIsFullscreenShow] = useState(false);
  const [mobileViewTab, setMobileViewTab] = useState<'slide' | 'notes'>('slide');
  const thumbnailsContainerRef = useRef<HTMLDivElement>(null);
  const mobileFilmstripRef = useRef<HTMLDivElement>(null);

  // Touch swipe support for mobile
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    // Minimum swipe threshold 35px, horizontal dominance
    if (Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      if (deltaX < 0) {
        // Swiped left -> Next slide
        setActiveSlideIndex((prev) => Math.min(totalSlides - 1, prev + 1));
      } else {
        // Swiped right -> Previous slide
        setActiveSlideIndex((prev) => Math.max(0, prev - 1));
      }
    }
  };

  // Derive slides with high-fidelity exact slide image URLs
  const slides: PPTSlide[] = React.useMemo(() => {
    if (ppt.slides && ppt.slides.length > 0) {
      return ppt.slides.map((s, idx) => {
        // Priority 1: explicitly stored slideImageUrl
        let exactUrl = s.slideImageUrl;
        // Priority 2: if ppt.images contains matching slide renders
        if (!exactUrl && ppt.images && ppt.images[idx]) {
          exactUrl = ppt.images[idx];
        }
        // Priority 3: slide's own images if it looks like a full slide render
        if (!exactUrl && s.images && s.images.length > 0) {
          exactUrl = s.images[0];
        }
        return {
          ...s,
          slideImageUrl: exactUrl
        };
      });
    }

    // Fallback if no structured slides: create virtual slides from ppt.images
    if (ppt.images && ppt.images.length > 0) {
      return ppt.images.map((img, idx) => ({
        slideNumber: idx + 1,
        title: `幻灯片第 ${idx + 1} 页`,
        paragraphs: [ppt.description || '现场实操说明物料'],
        images: [img],
        slideImageUrl: img
      }));
    }

    return [
      {
        slideNumber: 1,
        title: ppt.title,
        paragraphs: [ppt.description || '暂无幻灯片详情'],
        images: [],
        slideImageUrl: undefined
      }
    ];
  }, [ppt]);

  const totalSlides = slides.length;
  const currentSlide = slides[activeSlideIndex] || slides[0];

  // Auto-scroll thumbnail rails when active slide changes
  useEffect(() => {
    if (thumbnailsContainerRef.current) {
      const activeEl = thumbnailsContainerRef.current.querySelector(
        `[data-slide-index="${activeSlideIndex}"]`
      ) as HTMLElement | null;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
    if (mobileFilmstripRef.current) {
      const activeThumb = mobileFilmstripRef.current.querySelector(
        `[data-mobile-thumb="${activeSlideIndex}"]`
      ) as HTMLElement | null;
      if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeSlideIndex]);

  // Keyboard navigation for presentation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreenShow) {
          setIsFullscreenShow(false);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        setActiveSlideIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        setActiveSlideIndex((prev) => Math.min(totalSlides - 1, prev + 1));
      } else if (e.key === 'F5' || (e.key === 'f' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        setIsFullscreenShow((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalSlides, isFullscreenShow, onClose]);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Zoom controls
  const handleZoomIn = () => setZoomScale((prev) => Math.min(2, parseFloat((prev + 0.25).toFixed(2))));
  const handleZoomOut = () => setZoomScale((prev) => Math.max(0.75, parseFloat((prev - 0.25).toFixed(2))));
  const handleZoomReset = () => setZoomScale(1);

  // Determine active slide image
  const currentSlideImage = currentSlide.slideImageUrl || 
    (currentSlide.images && currentSlide.images.length > 0 ? currentSlide.images[0] : null);

  return (
    <>
      {/* 1. MAIN PRESENTATION VIEWER MODAL */}
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div 
          className="bg-slate-900 border-0 sm:border border-slate-800 w-full max-w-7xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[100dvh] sm:h-[94vh] sm:max-h-[980px] text-slate-100"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Bar */}
          <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 shrink-0 gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 shrink-0">
                    PPT原版预览
                  </span>
                  <span className="text-[11px] sm:text-xs text-amber-400 font-mono font-bold">
                    P{activeSlideIndex + 1}/{totalSlides}
                  </span>
                  <span className="text-xs text-slate-400 hidden md:inline">
                    · 16:9 原版排版
                  </span>
                </div>
                <h2 className="text-xs sm:text-base font-bold text-white truncate max-w-[140px] sm:max-w-md md:max-w-xl mt-0.5" title={ppt.title}>
                  {ppt.title}
                </h2>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Toggle Thumbnails Sidebar/Filmstrip */}
              <button
                onClick={() => setShowThumbnails((prev) => !prev)}
                className={`px-2 sm:px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1 text-xs font-medium ${
                  showThumbnails 
                    ? 'bg-slate-800 text-orange-400 border-orange-500/30' 
                    : 'bg-slate-950/60 text-slate-400 hover:text-white border-slate-800'
                }`}
                title={showThumbnails ? '收起幻灯片缩略图' : '展开幻灯片缩略图'}
              >
                {showThumbnails ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">缩略图</span>
              </button>

              {/* Fullscreen presentation toggle */}
              <button
                onClick={() => setIsFullscreenShow(true)}
                className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/40 text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                title="开启全屏演示放映 (快捷键: F5)"
              >
                <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current text-orange-400" />
                <span className="hidden sm:inline">全屏放映</span>
              </button>

              {/* QR Code button */}
              <button
                onClick={() => onOpenQRCode(ppt)}
                className="p-1.5 sm:p-2 text-slate-400 hover:text-amber-400 rounded-lg hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-colors"
                title="手机扫码在手机上查阅"
              >
                <QrCode className="w-4 h-4" />
              </button>

              {/* Close button */}
              <button
                onClick={onClose}
                className="p-1.5 sm:p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-colors"
                title="关闭预览 (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Mobile Tab Switcher between 16:9 Slide and Text/Notes */}
          <div className="sm:hidden flex items-center justify-between px-3 py-1.5 bg-slate-950/90 border-b border-slate-800 text-xs shrink-0">
            <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
              <button
                onClick={() => setMobileViewTab('slide')}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  mobileViewTab === 'slide'
                    ? 'bg-orange-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                16:9 原版幻灯片
              </button>
              <button
                onClick={() => setMobileViewTab('notes')}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  mobileViewTab === 'notes'
                    ? 'bg-orange-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                文字与要点
              </button>
            </div>

            <span className="text-[10px] text-slate-400 font-mono">
              👈 左右滑动翻页 👉
            </span>
          </div>

          {/* Central Workspace (Thumbnails Rail + 16:9 Presentation Stage + Optional Notes) */}
          <div className="flex-1 flex overflow-hidden bg-slate-950">
            
            {/* 2. LEFT THUMBNAILS RAIL (PowerPoint / WPS style sidebar, Desktop) */}
            {showThumbnails && (
              <div 
                ref={thumbnailsContainerRef}
                className="hidden md:flex w-56 lg:w-64 bg-slate-900/90 border-r border-slate-800/80 flex-col shrink-0 overflow-y-auto p-2.5 space-y-2.5 scrollbar-thin scrollbar-thumb-slate-800 animate-in slide-in-from-left-2 duration-150"
              >
                <div className="px-2 py-1 flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <span>幻灯片页面列表</span>
                  <span className="font-mono text-orange-400">{activeSlideIndex + 1}/{totalSlides}</span>
                </div>

                {slides.map((s, idx) => {
                  const isActive = idx === activeSlideIndex;
                  const thumbImg = s.slideImageUrl || (s.images && s.images.length > 0 ? s.images[0] : null);

                  return (
                    <div
                      key={idx}
                      data-slide-index={idx}
                      onClick={() => setActiveSlideIndex(idx)}
                      className={`group relative p-2 rounded-xl border transition-all cursor-pointer select-none flex flex-col gap-1.5 ${
                        isActive
                          ? 'bg-orange-500/10 border-orange-500 ring-2 ring-orange-500/30 text-white shadow-lg'
                          : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      {/* Slide number badge & title */}
                      <div className="flex items-center justify-between gap-1.5 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-mono font-bold shrink-0 ${
                            isActive ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-300'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="truncate font-medium text-[11px]" title={s.title}>
                            {s.title || `第 ${idx + 1} 页`}
                          </span>
                        </div>
                      </div>

                      {/* 16:9 Thumbnail miniature preview */}
                      <div className="w-full aspect-[16/9] bg-slate-900 rounded-lg overflow-hidden border border-slate-800 relative flex items-center justify-center">
                        {thumbImg ? (
                          <img
                            src={thumbImg}
                            alt={`第 ${idx + 1} 页缩略图`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        ) : (
                          <div className="p-2 text-center text-slate-500 text-[10px] leading-tight">
                            <FileText className="w-5 h-5 mx-auto mb-0.5 opacity-50" />
                            <span>文字页面</span>
                          </div>
                        )}
                        {/* Page watermarked index */}
                        <span className="absolute bottom-1 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-black/75 text-slate-300">
                          P{idx + 1}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 3. CENTER PRESENTATION STAGE */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
              
              {/* Slide Presentation Viewport */}
              <div 
                className="flex-1 overflow-auto p-1.5 sm:p-6 md:p-8 flex items-center justify-center bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900/60 relative"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                {/* Mobile Notes view tab */}
                {mobileViewTab === 'notes' ? (
                  <div className="sm:hidden w-full h-full overflow-y-auto p-3 space-y-3 bg-slate-900/90 rounded-xl border border-slate-800 text-slate-200">
                    <div className="border-b border-slate-800 pb-2 flex items-center justify-between">
                      <span className="text-orange-400 font-bold text-xs">第 {activeSlideIndex + 1}/{totalSlides} 页要点</span>
                      <span className="text-[11px] text-slate-400">{ppt.category}</span>
                    </div>
                    <h3 className="text-base font-bold text-white">{currentSlide.title || `第 ${activeSlideIndex + 1} 页`}</h3>
                    {currentSlide.subTitle && (
                      <p className="text-xs text-slate-400">{currentSlide.subTitle}</p>
                    )}
                    <div className="space-y-2 pt-1">
                      {currentSlide.paragraphs && currentSlide.paragraphs.length > 0 ? (
                        currentSlide.paragraphs.map((p, idx) => (
                          <div key={idx} className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 text-xs leading-relaxed">
                            <span className="text-orange-400 font-bold block mb-0.5">• 要点 {idx + 1}:</span>
                            {p}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400">本页无提取文本，请查看原版幻灯片展示。</p>
                      )}
                    </div>
                    {currentSlide.tables && currentSlide.tables.length > 0 && (
                      <div className="overflow-x-auto rounded-lg border border-slate-800">
                        <table className="w-full text-xs text-left">
                          {currentSlide.tables[0].headers && (
                            <thead className="bg-slate-950 text-slate-300 font-bold">
                              <tr>
                                {currentSlide.tables[0].headers.map((h, hIdx) => (
                                  <th key={hIdx} className="p-2">{h}</th>
                                ))}
                              </tr>
                            </thead>
                          )}
                          <tbody className="divide-y divide-slate-800 text-slate-300">
                            {currentSlide.tables[0].rows.map((row, rIdx) => (
                              <tr key={rIdx}>
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="p-2">{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  /* 16:9 Slide Canvas (Scaled & Centered) */
                  <div 
                    className="w-full max-w-5xl aspect-[16/9] rounded-lg sm:rounded-2xl bg-black border border-slate-800 shadow-2xl relative overflow-hidden flex items-center justify-center transition-transform duration-200"
                    style={{
                      transform: `scale(${zoomScale})`,
                      transformOrigin: 'center center'
                    }}
                  >
                    {/* Mobile swipe gesture badge hint */}
                    <div className="sm:hidden absolute top-2 left-2 z-20 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-[10px] text-slate-300 pointer-events-none flex items-center gap-1">
                      <ChevronLeft className="w-3 h-3 text-orange-400" />
                      <span>滑动翻页</span>
                      <ChevronRight className="w-3 h-3 text-orange-400" />
                    </div>

                    {currentSlideImage ? (
                      /* EXACT PPT SLIDE RENDERING (100% Fidelity, text & diagrams in unified original layout) */
                      <div className="w-full h-full relative flex items-center justify-center bg-black select-none">
                        <img
                          src={currentSlideImage}
                          alt={`PPT第 ${activeSlideIndex + 1} 页`}
                          className="w-full h-full object-contain pointer-events-none"
                          loading="eager"
                        />
                      </div>
                    ) : (
                      /* UNIFIED 16:9 POWERPOINT SLIDE LAYOUT (When no raster image is available) */
                      <div className="w-full h-full p-4 sm:p-12 flex flex-col justify-between bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-slate-100 select-none">
                        {/* Master Slide Header */}
                        <div className="border-b border-slate-800/80 pb-2 sm:pb-4 flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 text-xs text-orange-400 font-bold mb-1">
                              <span className="w-2 h-2 rounded-full bg-orange-400" />
                              <span>{ppt.category} · 幻灯片第 {activeSlideIndex + 1} 页</span>
                            </div>
                            <h3 className="text-lg sm:text-3xl font-extrabold text-white tracking-tight">
                              {currentSlide.title || `第 ${activeSlideIndex + 1} 页`}
                            </h3>
                            {currentSlide.subTitle && (
                              <p className="text-xs sm:text-sm text-slate-400 mt-1">{currentSlide.subTitle}</p>
                            )}
                          </div>
                          <span className="text-xs sm:text-sm font-mono text-slate-500 font-bold">
                            {activeSlideIndex + 1} / {totalSlides}
                          </span>
                        </div>

                        {/* Unified Slide Body */}
                        <div className="flex-1 py-3 sm:py-6 flex flex-col justify-center space-y-3 sm:space-y-4 overflow-hidden">
                          {currentSlide.paragraphs && currentSlide.paragraphs.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-4">
                              {currentSlide.paragraphs.map((p, pIdx) => (
                                <div key={pIdx} className="p-2.5 sm:p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                                  <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
                                    要点 {pIdx + 1}
                                  </span>
                                  <p className="text-xs sm:text-base text-slate-200 leading-relaxed">
                                    {p}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center text-slate-500 text-xs sm:text-sm">
                              本页为图示版面，请参阅演示图解
                            </div>
                          )}

                          {/* Slide Tables if present */}
                          {currentSlide.tables && currentSlide.tables.length > 0 && (
                            <div className="overflow-x-auto rounded-xl border border-slate-800">
                              <table className="w-full text-xs text-left text-slate-300">
                                {currentSlide.tables[0].headers && (
                                  <thead className="bg-slate-900 text-slate-200 border-b border-slate-800 font-bold">
                                    <tr>
                                      {currentSlide.tables[0].headers.map((h, hIdx) => (
                                        <th key={hIdx} className="p-2 font-semibold">{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                )}
                                <tbody className="divide-y divide-slate-800/60 bg-slate-950">
                                  {currentSlide.tables[0].rows.map((row, rIdx) => (
                                    <tr key={rIdx}>
                                      {row.map((cell, cIdx) => (
                                        <td key={cIdx} className="p-2">{cell}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* Master Slide Footer */}
                        <div className="border-t border-slate-800/80 pt-2 sm:pt-3 flex items-center justify-between text-[10px] sm:text-xs text-slate-500">
                          <span>{ppt.title}</span>
                          <span>现场课件资料 · 企划工程</span>
                        </div>
                      </div>
                    )}

                    {/* Previous / Next on-canvas click hotspots */}
                    <button
                      onClick={() => setActiveSlideIndex((prev) => Math.max(0, prev - 1))}
                      disabled={activeSlideIndex === 0}
                      className="absolute left-1 sm:left-3 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-black/60 hover:bg-black/85 text-white/75 hover:text-white backdrop-blur-md opacity-70 sm:opacity-0 sm:hover:opacity-100 transition-all disabled:hidden shadow-xl"
                      title="上一页"
                    >
                      <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <button
                      onClick={() => setActiveSlideIndex((prev) => Math.min(totalSlides - 1, prev + 1))}
                      disabled={activeSlideIndex === totalSlides - 1}
                      className="absolute right-1 sm:right-3 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-black/60 hover:bg-black/85 text-white/75 hover:text-white backdrop-blur-md opacity-70 sm:opacity-0 sm:hover:opacity-100 transition-all disabled:hidden shadow-xl"
                      title="下一页"
                    >
                      <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>

                    {/* Bottom watermark on slide canvas */}
                    <div className="absolute bottom-2 right-2.5 sm:bottom-2.5 sm:right-3 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md bg-black/60 backdrop-blur-sm text-[10px] sm:text-[11px] font-mono font-medium text-slate-300 pointer-events-none">
                      {activeSlideIndex + 1} / {totalSlides}
                    </div>
                  </div>
                )}

              </div>

              {/* Mobile horizontal thumbnails filmstrip (when showThumbnails is active on <md) */}
              {showThumbnails && (
                <div 
                  ref={mobileFilmstripRef}
                  className="md:hidden bg-slate-900/95 border-t border-slate-800 px-2 py-1.5 flex overflow-x-auto gap-2 shrink-0 scrollbar-none items-center"
                >
                  {slides.map((s, idx) => {
                    const isActive = idx === activeSlideIndex;
                    const thumbImg = s.slideImageUrl || (s.images && s.images[0]);
                    return (
                      <button
                        key={idx}
                        data-mobile-thumb={idx}
                        onClick={() => setActiveSlideIndex(idx)}
                        className={`shrink-0 w-16 sm:w-20 aspect-[16/9] rounded-lg overflow-hidden border relative transition-all active:scale-95 ${
                          isActive
                            ? 'border-orange-500 ring-2 ring-orange-500/50'
                            : 'border-slate-800 opacity-60 hover:opacity-100'
                        }`}
                      >
                        {thumbImg ? (
                          <img src={thumbImg} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-slate-950 flex items-center justify-center text-[10px] text-slate-400 font-mono">
                            P{idx + 1}
                          </div>
                        )}
                        <span className={`absolute bottom-0.5 right-0.5 px-1 rounded text-[8px] font-mono font-bold ${
                          isActive ? 'bg-orange-500 text-white' : 'bg-black/80 text-slate-300'
                        }`}>
                          P{idx + 1}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Bottom Presentation Controls Toolbar */}
              <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between gap-2 shrink-0">
                {/* Page Navigation */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActiveSlideIndex((prev) => Math.max(0, prev - 1))}
                    disabled={activeSlideIndex === 0}
                    className="min-h-[36px] px-2 sm:px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-30 disabled:hover:bg-slate-800 border border-slate-700 transition-colors flex items-center gap-1 text-xs font-medium active:scale-95"
                    title="上一页 (← 方向键)"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">上一页</span>
                  </button>

                  <div className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono font-bold text-white flex items-center gap-1">
                    <span className="text-orange-400">{activeSlideIndex + 1}</span>
                    <span className="text-slate-500">/</span>
                    <span>{totalSlides}</span>
                  </div>

                  <button
                    onClick={() => setActiveSlideIndex((prev) => Math.min(totalSlides - 1, prev + 1))}
                    disabled={activeSlideIndex === totalSlides - 1}
                    className="min-h-[36px] px-2 sm:px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-30 disabled:hover:bg-slate-800 border border-slate-700 transition-colors flex items-center gap-1 text-xs font-medium active:scale-95"
                    title="下一页 (→ 方向键 / 空格)"
                  >
                    <span className="hidden sm:inline">下一页</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Center / Zoom & Presentation Toolbar */}
                <div className="flex items-center gap-1.5">
                  <div className="hidden sm:flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-xs text-slate-300">
                    <button
                      onClick={handleZoomOut}
                      disabled={zoomScale <= 0.75}
                      className="p-1.5 hover:text-white hover:bg-slate-800 rounded disabled:opacity-30 transition-colors"
                      title="缩小幻灯片"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleZoomReset}
                      className="px-2 py-1 font-mono hover:text-orange-400 hover:bg-slate-800 rounded transition-colors text-[11px]"
                      title="重置适应屏幕 (100%)"
                    >
                      {Math.round(zoomScale * 100)}%
                    </button>
                    <button
                      onClick={handleZoomIn}
                      disabled={zoomScale >= 2}
                      className="p-1.5 hover:text-white hover:bg-slate-800 rounded disabled:opacity-30 transition-colors"
                      title="放大幻灯片"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Toggle Lecture Notes & Text Drawer (Desktop) */}
                  <button
                    onClick={() => setShowNotesDrawer((prev) => !prev)}
                    className={`hidden md:flex px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors items-center gap-1.5 ${
                      showNotesDrawer
                        ? 'bg-slate-800 text-orange-400 border-orange-500/30'
                        : 'bg-slate-950 text-slate-300 hover:text-white border-slate-800'
                    }`}
                    title="展开/收起本页课件文字与操作备注"
                  >
                    <FileText className="w-3.5 h-3.5 text-orange-400" />
                    <span>课件文字与备注</span>
                  </button>

                  {/* Fullscreen presentation button */}
                  <button
                    onClick={() => setIsFullscreenShow(true)}
                    className="p-2 sm:px-3 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors flex items-center gap-1.5"
                    title="全屏演示放映"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-orange-400" />
                    <span className="hidden sm:inline">全屏演示</span>
                  </button>
                </div>

              </div>

            </div>

            {/* 4. OPTIONAL RIGHT SLIDE-OVER DRAWER FOR NOTES & STRUCTURED TEXT */}
            {showNotesDrawer && (
              <div className="w-72 sm:w-80 md:w-96 bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 overflow-y-auto p-4 space-y-4 animate-in slide-in-from-right-2 duration-150">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-orange-400" />
                    <h4 className="text-sm font-bold text-white">本页文字与操作要领</h4>
                  </div>
                  <button
                    onClick={() => setShowNotesDrawer(false)}
                    className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3 text-xs leading-relaxed">
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-slate-400 block mb-1 font-bold">幻灯片标题</span>
                    <p className="text-white font-semibold text-sm">
                      {currentSlide.title || `第 ${activeSlideIndex + 1} 页`}
                    </p>
                  </div>

                  {currentSlide.paragraphs && currentSlide.paragraphs.length > 0 ? (
                    <div className="space-y-2">
                      <span className="text-slate-400 block font-bold">要点内容与步骤说明</span>
                      {currentSlide.paragraphs.map((p, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1 text-slate-200">
                          <div className="flex items-center gap-1.5 text-[11px] text-orange-400 font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                            <span>要领 #{idx + 1}</span>
                          </div>
                          <p>{p}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 italic">本页主要为视觉图解看板，无独立长文本。</p>
                  )}

                  {/* Tables in notes if any */}
                  {currentSlide.tables && currentSlide.tables.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <span className="text-slate-400 block font-bold">参数表格明细</span>
                      <div className="overflow-x-auto rounded-xl border border-slate-800 text-[11px]">
                        <table className="w-full text-left text-slate-300">
                          {currentSlide.tables[0].headers && (
                            <thead className="bg-slate-950 text-slate-200 font-bold">
                              <tr>
                                {currentSlide.tables[0].headers.map((h, i) => (
                                  <th key={i} className="p-2 whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                          )}
                          <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
                            {currentSlide.tables[0].rows.map((row, rI) => (
                              <tr key={rI}>
                                {row.map((cell, cI) => (
                                  <td key={cI} className="p-2">{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
                    💡 提示：您可直接在左侧 16:9 画布中查阅 PPT 的原始原版排版。此处为提取的纯文本数据，便于复制与记录。
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Footer Action Bar */}
          <div className="px-3 sm:px-4 py-2 sm:py-3 border-t border-slate-800 bg-slate-900/95 flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0">
            <div className="hidden sm:flex text-xs text-slate-400 items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">
                100% 还原原始 PPT 版式格式 · 现场人员免登录自由下载
              </span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {/* Planner edit/delete controls */}
              {isPlanner && (
                <>
                  {onEdit && (
                    <button
                      onClick={() => {
                        onClose();
                        onEdit(ppt);
                      }}
                      className="px-2.5 sm:px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-medium border border-slate-700 transition-colors flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                      <span className="hidden xs:inline">编辑</span>
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => {
                        onClose();
                        onDelete(ppt);
                      }}
                      className="px-2.5 sm:px-3 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs font-medium border border-rose-800/40 transition-colors flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span className="hidden xs:inline">删除</span>
                    </button>
                  )}
                </>
              )}

              <button
                onClick={() => onOpenQRCode(ppt)}
                className="px-3 sm:px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition-colors active:scale-95 shrink-0"
                title="手机扫码在手机上下载查阅"
              >
                <QrCode className="w-4 h-4 text-amber-400" />
                <span>手机扫码</span>
              </button>

              <button
                id="btn-modal-download"
                onClick={() => onDownload(ppt)}
                className="flex-1 sm:flex-none px-4 sm:px-5 py-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-orange-600/30 flex items-center justify-center gap-2 transition-all transform active:scale-95"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>下载 PPT ({formatBytes(ppt.fileSize)})</span>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* 5. FULL-SCREEN PRESENTATION SLIDE SHOW (F5 Mode) */}
      {isFullscreenShow && (
        <div 
          className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center animate-in fade-in select-none"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={(e) => {
            // Click right half to advance, left half to go back
            const clickX = e.clientX;
            const width = window.innerWidth;
            if (clickX > width * 0.6) {
              setActiveSlideIndex((prev) => Math.min(totalSlides - 1, prev + 1));
            } else if (clickX < width * 0.4) {
              setActiveSlideIndex((prev) => Math.max(0, prev - 1));
            }
          }}
        >
          {/* Main Slide in Fullscreen */}
          <div className="relative w-full h-full max-w-[96vw] max-h-[96vh] flex items-center justify-center p-4">
            {currentSlideImage ? (
              <img
                src={currentSlideImage}
                alt={`幻灯片第 ${activeSlideIndex + 1} 页`}
                className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
              />
            ) : (
              <div className="w-full aspect-[16/9] max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl p-12 flex flex-col justify-between text-white shadow-2xl">
                <div>
                  <span className="text-orange-400 font-mono text-sm">第 {activeSlideIndex + 1} / {totalSlides} 页</span>
                  <h2 className="text-4xl font-extrabold mt-2">{currentSlide.title}</h2>
                </div>
                <div className="space-y-4 my-auto">
                  {currentSlide.paragraphs.map((p, idx) => (
                    <p key={idx} className="text-xl text-slate-200 leading-relaxed">• {p}</p>
                  ))}
                </div>
                <div className="text-xs text-slate-500">{ppt.title}</div>
              </div>
            )}
          </div>

          {/* Floating Minimal Controls on Hover (Bottom) */}
          <div 
            className="absolute bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full bg-slate-950/80 hover:bg-slate-950 text-white backdrop-blur-md border border-slate-700/80 shadow-2xl flex items-center gap-4 transition-opacity opacity-40 hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setActiveSlideIndex((prev) => Math.max(0, prev - 1))}
              disabled={activeSlideIndex === 0}
              className="p-1 text-slate-300 hover:text-white disabled:opacity-20 transition-colors"
              title="上一页 (←)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <span className="font-mono text-xs font-bold text-slate-200 px-2">
              <span className="text-orange-400">{activeSlideIndex + 1}</span> / {totalSlides}
            </span>

            <button
              onClick={() => setActiveSlideIndex((prev) => Math.min(totalSlides - 1, prev + 1))}
              disabled={activeSlideIndex === totalSlides - 1}
              className="p-1 text-slate-300 hover:text-white disabled:opacity-20 transition-colors"
              title="下一页 (→)"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <div className="w-px h-4 bg-slate-700 mx-1" />

            <button
              onClick={() => setIsFullscreenShow(false)}
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 hover:text-white transition-colors flex items-center gap-1"
              title="退出全屏演示 (Esc)"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>退出放映</span>
            </button>
          </div>

          {/* Top subtle close button */}
          <button
            onClick={() => setIsFullscreenShow(false)}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-black/60 hover:bg-black/90 text-slate-400 hover:text-white transition-colors"
            title="退出放映 (Esc)"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
    </>
  );
};
