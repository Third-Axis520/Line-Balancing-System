import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  RefreshCw, 
  ArrowUpDown,
  FolderOpen
} from 'lucide-react';
import { PPTItem, AuthState } from './types';
import { Navbar } from './components/Navbar';
import { PPTCard } from './components/PPTCard';
import { PPTDetailModal } from './components/PPTDetailModal';
import { UploadModal } from './components/UploadModal';
import { EditModal } from './components/EditModal';
import { LoginModal, PasswordModal } from './components/LoginModal';
import { QRCodeModal } from './components/QRCodeModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { ToastContainer, ToastMessage } from './components/Toast';

export default function App() {
  const [ppts, setPpts] = useState<PPTItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<'default' | 'downloads' | 'size' | 'images'>('default');

  // Auth State
  const [auth, setAuth] = useState<AuthState>({
    isAuthenticated: false,
    username: '',
    role: 'guest',
    token: undefined,
  });

  // Modals
  const [selectedPPTForDetail, setSelectedPPTForDetail] = useState<PPTItem | null>(null);
  const [selectedPPTForQR, setSelectedPPTForQR] = useState<PPTItem | null>(null);
  const [selectedPPTForEdit, setSelectedPPTForEdit] = useState<PPTItem | null>(null);
  const [selectedPPTForDelete, setSelectedPPTForDelete] = useState<PPTItem | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // Toast feedback
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Check saved token on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('qihua_token');
    const savedUser = localStorage.getItem('qihua_user');
    if (savedToken) {
      fetch('/api/auth/check', {
        method: 'POST',
        headers: { Authorization: `Bearer ${savedToken}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.valid) {
            setAuth({
              isAuthenticated: true,
              username: data.username || savedUser || 'qihua',
              role: 'planner',
              token: savedToken,
            });
          } else {
            localStorage.removeItem('qihua_token');
            localStorage.removeItem('qihua_user');
          }
        })
        .catch(() => {});
    }
  }, []);

  // Fetch PPTs
  const fetchPPTs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/ppts');
      if (res.ok) {
        const data = await res.json();
        setPpts(data);
      } else {
        addToast('error', '加载 PPT 列表失败');
      }
    } catch {
      addToast('error', '网络连接失败，无法获取物料数据');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPPTs();
  }, []);

  // Login Handler
  const handleLoginSuccess = (token: string, username: string) => {
    localStorage.setItem('qihua_token', token);
    localStorage.setItem('qihua_user', username);
    setAuth({
      isAuthenticated: true,
      username,
      role: 'planner',
      token,
    });
    addToast('success', `企划人员 ${username} 已登录，具有上传/修改/删除权限`);
  };

  // Logout Handler
  const handleLogout = async () => {
    if (auth.token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${auth.token}` },
        });
      } catch {}
    }
    localStorage.removeItem('qihua_token');
    localStorage.removeItem('qihua_user');
    setAuth({
      isAuthenticated: false,
      username: '',
      role: 'guest',
      token: undefined,
    });
    addToast('info', '已退出企划账号，当前为现场员工模式');
  };

  // Download Handler
  const handleDownload = (ppt: PPTItem) => {
    // Trigger download in browser
    const link = document.createElement('a');
    link.href = ppt.fileUrl;
    link.setAttribute('download', ppt.originalFileName || `${ppt.title}.pptx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Optimistically increment download count
    setPpts((prev) =>
      prev.map((item) =>
        item.id === ppt.id ? { ...item, downloadCount: (item.downloadCount || 0) + 1 } : item
      )
    );

    addToast('success', `开始下载《${ppt.title}》，请在浏览器下载中查看`);
  };

  // Delete Handler (Planner only)
  const handleDeletePPT = async (ppt: PPTItem) => {
    if (!auth.token) {
      addToast('error', '请先登录企划管理账号以执行删除操作');
      setIsLoginModalOpen(true);
      return;
    }

    try {
      const res = await fetch(`/api/ppts/${ppt.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPpts((prev) => prev.filter((p) => p.id !== ppt.id));
        if (selectedPPTForDetail?.id === ppt.id) {
          setSelectedPPTForDetail(null);
        }
        setSelectedPPTForDelete(null);
        addToast('success', `课件《${ppt.title}》已成功删除`);
      } else {
        addToast('error', data.error || '删除失败');
      }
    } catch {
      addToast('error', '网络错误，删除失败');
    }
  };

  // Filter and Sort PPTs
  const filteredPPTs = useMemo(() => {
    let list = [...ppts];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q))
      );
    }

    const parseUploadTime = (dateStr?: string): number => {
      if (!dateStr) return 0;
      const parsed = Date.parse(dateStr.replace(' ', 'T'));
      return isNaN(parsed) ? (new Date(dateStr).getTime() || 0) : parsed;
    };

    if (sortOption === 'downloads') {
      list.sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0));
    } else if (sortOption === 'size') {
      list.sort((a, b) => (b.fileSize || 0) - (a.fileSize || 0));
    } else if (sortOption === 'images') {
      list.sort((a, b) => (b.imageCount || 0) - (a.imageCount || 0));
    } else {
      // Default: when top/pin is not set, files are sorted by upload time in descending order (降序)
      list.sort((a, b) => {
        const aPinned = Boolean(a.isPinned);
        const bPinned = Boolean(b.isPinned);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        return parseUploadTime(b.uploadDate) - parseUploadTime(a.uploadDate);
      });
    }

    return list;
  }, [ppts, searchQuery, sortOption]);

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex flex-col selection:bg-orange-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        auth={auth}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        onOpenUpload={() => setIsUploadModalOpen(true)}
        onLogout={handleLogout}
        onOpenPasswordModal={() => setIsPasswordModalOpen(true)}
        totalPPTs={ppts.length}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索改善案例课件标题、说明..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs sm:text-sm placeholder:text-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200"
              >
                清空
              </button>
            )}
          </div>

          {/* Sorting & Refresh */}
          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-xs text-slate-300">
              <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-400 hidden sm:inline">排序:</span>
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as any)}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="default" className="bg-slate-900">置顶优先 / 上传时间降序</option>
                <option value="downloads" className="bg-slate-900">下载量最多</option>
                <option value="images" className="bg-slate-900">含图片最多</option>
                <option value="size" className="bg-slate-900">文件大小从大到小</option>
              </select>
            </div>

            <button
              onClick={fetchPPTs}
              className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors"
              title="刷新列表"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* PPT Cards Grid */}
        {isLoading ? (
          <div className="py-20 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-orange-500 animate-spin mx-auto" />
            <p className="text-sm text-slate-400">正在获取现场 PPT 演示文稿物料...</p>
          </div>
        ) : filteredPPTs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredPPTs.map((ppt) => (
              <PPTCard
                key={ppt.id}
                ppt={ppt}
                isPlanner={auth.isAuthenticated}
                onView={(item) => setSelectedPPTForDetail(item)}
                onDownload={handleDownload}
                onOpenQRCode={(item) => setSelectedPPTForQR(item)}
                onEdit={(item) => setSelectedPPTForEdit(item)}
                onDelete={(item) => setSelectedPPTForDelete(item)}
              />
            ))}
          </div>
        ) : (
          <div className="py-16 text-center rounded-2xl bg-slate-900/50 border border-slate-800/80 p-8 space-y-3">
            <FolderOpen className="w-12 h-12 text-slate-600 mx-auto" />
            <h3 className="text-base font-bold text-slate-300">暂无符合条件的 PPT 演示文稿</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchQuery ? `未找到与“${searchQuery}”相关的物料` : '当前暂无发布文稿'}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 text-xs text-orange-400 hover:text-orange-300 underline font-medium"
              >
                清空搜索关键词
              </button>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>生产线平衡改善案例系统 · 运行正常</span>
          </div>
          <div className="text-center sm:text-right">
            案例课件免登录浏览下载 · 支持高清内容预览与一键存盘
          </div>
        </div>
      </footer>

      {/* Modals */}
      {selectedPPTForDetail && (
        <PPTDetailModal
          ppt={selectedPPTForDetail}
          isPlanner={auth.isAuthenticated}
          onClose={() => setSelectedPPTForDetail(null)}
          onDownload={handleDownload}
          onOpenQRCode={(ppt) => setSelectedPPTForQR(ppt)}
          onEdit={(ppt) => setSelectedPPTForEdit(ppt)}
          onDelete={(ppt) => {
            setSelectedPPTForDetail(null);
            setSelectedPPTForDelete(ppt);
          }}
        />
      )}

      {selectedPPTForQR && (
        <QRCodeModal
          ppt={selectedPPTForQR}
          onClose={() => setSelectedPPTForQR(null)}
          onDownload={handleDownload}
        />
      )}

      {selectedPPTForDelete && (
        <DeleteConfirmModal
          ppt={selectedPPTForDelete}
          onClose={() => setSelectedPPTForDelete(null)}
          onConfirm={handleDeletePPT}
        />
      )}

      {isUploadModalOpen && (
        <UploadModal
          onClose={() => setIsUploadModalOpen(false)}
          onSuccess={(msg) => {
            addToast('success', msg);
            fetchPPTs();
          }}
          token={auth.token}
        />
      )}

      {selectedPPTForEdit && (
        <EditModal
          ppt={selectedPPTForEdit}
          onClose={() => setSelectedPPTForEdit(null)}
          onSuccess={(updated, msg) => {
            addToast('success', msg);
            setPpts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          }}
          token={auth.token}
        />
      )}

      {isLoginModalOpen && (
        <LoginModal
          onClose={() => setIsLoginModalOpen(false)}
          onSuccess={handleLoginSuccess}
        />
      )}

      {isPasswordModalOpen && (
        <PasswordModal
          onClose={() => setIsPasswordModalOpen(false)}
          token={auth.token}
          onSuccess={(msg) => addToast('success', msg)}
        />
      )}

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
