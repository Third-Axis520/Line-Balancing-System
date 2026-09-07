import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  LogIn, 
  LogOut, 
  ShieldCheck, 
  UserCheck, 
  KeyRound,
  Layers,
  Sparkles
} from 'lucide-react';
import { AuthState } from '../types';

interface NavbarProps {
  auth: AuthState;
  onOpenLogin: () => void;
  onOpenUpload: () => void;
  onLogout: () => void;
  onOpenPasswordModal: () => void;
  totalPPTs: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  auth,
  onOpenLogin,
  onOpenUpload,
  onLogout,
  onOpenPasswordModal,
  totalPPTs,
}) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-slate-100 transition-all">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-20">
          {/* Logo & Title */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-gradient-to-br from-amber-500 via-orange-600 to-rose-600 flex items-center justify-center shadow-lg shadow-orange-500/20 ring-1 ring-white/20 shrink-0">
              <FileSpreadsheet className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-xl font-bold tracking-tight text-white truncate">
                生产线平衡改善案例系统
              </h1>
              <p className="text-[10px] sm:text-xs text-slate-400 hidden sm:block">
                现场改善课件库 · 高清原版浏览与高速下载
              </p>
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {auth.isAuthenticated ? (
              // Planner Logged In Mode
              <div className="flex items-center gap-2">
                <button
                  id="btn-upload-ppt"
                  onClick={onOpenUpload}
                  className="flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-xs sm:text-sm font-semibold shadow-md shadow-orange-600/25 transition-all transform active:scale-95"
                >
                  <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>上传<span className="hidden sm:inline">新PPT</span></span>
                </button>

                {/* Planner Account Profile Dropdown */}
                <div className="relative">
                  <button
                    id="btn-profile-toggle"
                    onClick={() => setShowProfileMenu(!showProfileMenu)}
                    className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs sm:text-sm text-slate-200 transition-colors"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
                    <span className="font-medium max-w-[70px] sm:max-w-none truncate">{auth.username}</span>
                  </button>

                  {showProfileMenu && (
                    <>
                      {/* Click outside backdrop */}
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setShowProfileMenu(false)} 
                      />
                      <div className="absolute right-0 mt-2 w-52 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl ring-1 ring-white/10 py-1.5 z-50 text-xs sm:text-sm">
                        <div className="px-3.5 py-2.5 border-b border-slate-800 text-slate-300 text-xs font-medium bg-slate-950/60 rounded-t-xl">
                          <span className="text-amber-400 font-bold block mb-0.5">企划管理权限已生效</span>
                          <span className="text-slate-400 text-[11px]">可上传、修改及删除课件</span>
                        </div>
                        <button
                          onClick={() => {
                            setShowProfileMenu(false);
                            onOpenPasswordModal();
                          }}
                          className="w-full text-left px-3.5 py-2.5 text-slate-200 hover:bg-slate-800 hover:text-white flex items-center gap-2.5 transition-colors"
                        >
                          <KeyRound className="w-4 h-4 text-slate-400" />
                          <span>修改企划密码</span>
                        </button>
                        <button
                          onClick={() => {
                            setShowProfileMenu(false);
                            onLogout();
                          }}
                          className="w-full text-left px-3.5 py-2.5 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 flex items-center gap-2.5 transition-colors border-t border-slate-800"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>退出企划登录</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              // Field Staff (Guest) Mode - No Login Required
              <div className="flex items-center gap-2">
                <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/50 border border-emerald-800/40 text-emerald-400 text-xs font-medium">
                  <UserCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>现场员工免登录查阅下载</span>
                </div>

                <button
                  id="btn-login-planner"
                  onClick={onOpenLogin}
                  className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg sm:rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs sm:text-sm text-slate-300 hover:text-white transition-all active:scale-95"
                  title="仅企划人员需要登录以进行上传、编辑和删除"
                >
                  <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                  <span>企划入口</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
