import React, { useState } from 'react';
import { X, Lock, ShieldCheck, AlertCircle, Loader2, KeyRound } from 'lucide-react';

interface LoginModalProps {
  onClose: () => void;
  onSuccess: (token: string, username: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onClose, onSuccess }) => {
  const [username, setUsername] = useState('qihua');
  const [password, setPassword] = useState('qihua123');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onSuccess(data.token, data.username);
        onClose();
      } else {
        setErrorMessage(data.error || '登录失败，请检查企划账号与密码');
      }
    } catch {
      setErrorMessage('网络请求异常，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFillDemo = () => {
    setUsername('qihua');
    setPassword('qihua123');
    setErrorMessage('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-6 sm:p-7 text-slate-100 relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">企划账号登录</h3>
            <p className="text-xs text-amber-400 font-medium">具有 PPT 上传、修改与删除特权</p>
          </div>
        </div>

        {/* Notice for field staff vs planner */}
        <div className="mb-5 p-3 rounded-xl bg-slate-800/70 border border-slate-750 text-xs text-slate-300 leading-relaxed">
          <p className="font-semibold text-slate-200 mb-1 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            无需登录说明：
          </p>
          现场员工<strong>不需要任何登录</strong>即可直接浏览、检索、预览多图并高速下载全部 PPT 文件。本登录入口仅供企划人员维护文件使用。
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4 text-xs sm:text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              企划账号
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入企划用户名"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-orange-500 transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              账号密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-orange-500 transition-colors"
              required
            />
          </div>

          {/* Quick preset hint */}
          <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
            <span>默认企划账号: qihua / qihua123</span>
            <button
              type="button"
              onClick={handleFillDemo}
              className="text-amber-400 hover:text-amber-300 underline font-medium"
            >
              一键填入
            </button>
          </div>

          <div className="pt-3">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-sm shadow-lg shadow-orange-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>验证中...</span>
                </>
              ) : (
                <span>登录企划账号</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const PasswordModal: React.FC<{
  onClose: () => void;
  token?: string;
  onSuccess: (msg: string) => void;
}> = ({ onClose, token, onSuccess }) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
    if (newPassword.length < 4) {
      setError('新密码长度不能少于4位');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onSuccess(data.message || '密码修改成功');
        onClose();
      } else {
        setError(data.error || '修改密码失败');
      }
    } catch {
      setError('网络请求失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl shadow-2xl p-6 text-slate-100 relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <KeyRound className="w-5 h-5 text-amber-400" />
          <h3 className="text-base font-bold text-white">修改企划密码</h3>
        </div>

        {error && (
          <div className="mb-3 p-2.5 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs sm:text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">原密码</label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-orange-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">新密码</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-orange-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">确认新密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:border-orange-500"
              required
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-750 text-xs font-medium"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-all disabled:opacity-50"
            >
              {isLoading ? '修改中...' : '确认更新'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
