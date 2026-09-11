import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, Loader2, Search, ShieldCheck, Trash2, UserPlus, Users, X } from 'lucide-react';
import { callApi } from '../auth/api';
import { DirectoryIdentitySummary, PlannerPermissionsResponse } from '../types';

interface PlannerPermissionsModalProps {
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

async function getErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string') {
      return data.message;
    }
  } catch {
    // Use the Chinese fallback when an error response has no JSON body.
  }
  return fallback;
}

function isPlannerPermissionsResponse(data: unknown): data is PlannerPermissionsResponse {
  return typeof data === 'object'
    && data !== null
    && 'planners' in data
    && Array.isArray(data.planners);
}

function isDirectorySearchResponse(data: unknown): data is { employees: DirectoryIdentitySummary[] } {
  return typeof data === 'object'
    && data !== null
    && 'employees' in data
    && Array.isArray(data.employees);
}

export const PlannerPermissionsModal: React.FC<PlannerPermissionsModalProps> = ({ onClose, onSuccess, onError }) => {
  const [planners, setPlanners] = useState<DirectoryIdentitySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [oid, setOid] = useState('');
  const [searchResults, setSearchResults] = useState<DirectoryIdentitySummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isGranting, setIsGranting] = useState(false);
  const [revokingOid, setRevokingOid] = useState<string | null>(null);

  const loadPlanners = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setLoadError('');

    try {
      const response = await callApi('/api/admin/planners');
      if (!response.ok) {
        const message = await getErrorMessage(response, '加载企划权限失败，请稍后重试');
        setLoadError(message);
        onError(message);
        return false;
      }

      const data: unknown = await response.json();
      if (!isPlannerPermissionsResponse(data)) {
        const message = '企划权限数据格式异常';
        setLoadError(message);
        onError(message);
        return false;
      }

      setPlanners(data.planners);
      return true;
    } catch {
      const message = '网络请求失败，无法加载企划权限';
      setLoadError(message);
      onError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void loadPlanners();
  }, [loadPlanners]);

  const handleSearch = async () => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      const message = '请输入至少 2 个字符后再搜索';
      onError(message);
      return;
    }

    setIsSearching(true);
    try {
      const response = await callApi(`/api/admin/directory-search?q=${encodeURIComponent(trimmedQuery)}`);
      if (!response.ok) {
        onError(await getErrorMessage(response, '搜索员工目录失败，请稍后重试'));
        return;
      }

      const data: unknown = await response.json();
      if (!isDirectorySearchResponse(data)) {
        onError('员工目录数据格式异常');
        return;
      }
      setSearchResults(data.employees);
    } catch {
      onError('网络请求失败，无法搜索员工目录');
    } finally {
      setIsSearching(false);
    }
  };

  const handleGrant = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedOid = oid.trim();
    if (!trimmedOid) {
      onError('请输入员工 OID');
      return;
    }

    setIsGranting(true);
    try {
      const response = await callApi('/api/admin/planners', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oid: trimmedOid }),
      });
      if (!response.ok) {
        onError(await getErrorMessage(response, '授予企划权限失败，请稍后重试'));
        return;
      }

      // PUT returns OID strings; retrieve the safe identity summaries instead.
      if (await loadPlanners()) {
        setOid('');
        setQuery('');
        setSearchResults([]);
        onSuccess('已授予企划权限');
      }
    } catch {
      onError('网络请求失败，无法授予企划权限');
    } finally {
      setIsGranting(false);
    }
  };

  const handleRevoke = async (plannerOid: string) => {
    setRevokingOid(plannerOid);
    try {
      const response = await callApi(`/api/admin/planners/${encodeURIComponent(plannerOid)}`, { method: 'DELETE' });
      if (!response.ok) {
        onError(await getErrorMessage(response, '撤销企划权限失败，请稍后重试'));
        return;
      }

      // DELETE returns OID strings; retrieve the safe identity summaries instead.
      if (await loadPlanners()) onSuccess('已撤销企划权限');
    } catch {
      onError('网络请求失败，无法撤销企划权限');
    } finally {
      setRevokingOid(null);
    }
  };

  const isMutating = isGranting || revokingOid !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-2 backdrop-blur-sm animate-in fade-in sm:p-6">
      <div className="relative my-auto max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-4 text-slate-100 shadow-2xl sm:p-7">
        <button
          type="button"
          onClick={onClose}
          disabled={isMutating}
          aria-label="关闭"
          className="absolute right-3.5 top-3.5 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:right-5 sm:top-5"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-5 flex items-center gap-2.5 pr-8">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/20 text-orange-400 sm:h-9 sm:w-9">
            <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white sm:text-lg">企划权限管理</h3>
            <p className="text-[11px] text-slate-400 sm:text-xs">搜索员工或直接输入 OID，管理可发布企划课件的人员。</p>
          </div>
        </div>

        <form onSubmit={handleGrant} className="space-y-3.5 border-b border-slate-800 pb-5 text-xs sm:text-sm">
          <div>
            <label htmlFor="planner-oid" className="mb-1 block text-xs font-semibold text-slate-300">员工 OID</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="planner-oid"
                value={oid}
                onChange={(event) => setOid(event.target.value)}
                placeholder="输入或从搜索结果中选择员工 OID"
                className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-xs text-slate-100 transition-colors focus:border-orange-500 focus:outline-none sm:text-sm"
                disabled={isGranting}
              />
              <button
                type="submit"
                disabled={isGranting}
                className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-orange-600/20 transition-all hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50 active:scale-95 sm:text-sm"
              >
                {isGranting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {isGranting ? '授权中...' : '授予权限'}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="planner-search" className="mb-1 block text-xs font-semibold text-slate-300">员工目录搜索</label>
            <div className="flex gap-2">
              <input
                id="planner-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.preventDefault();
                }}
                placeholder="姓名或邮箱（至少 2 个字符）"
                className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-xs text-slate-100 transition-colors focus:border-orange-500 focus:outline-none sm:text-sm"
                disabled={isSearching}
              />
              <button
                type="button"
                onClick={() => void handleSearch()}
                disabled={isSearching}
                className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
              >
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                搜索
              </button>
            </div>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/40 p-2.5">
              <p className="px-1 text-[11px] font-medium text-slate-400">点击员工以填入 OID</p>
              {searchResults.map((employee) => (
                <button
                  key={employee.oid}
                  type="button"
                  onClick={() => setOid(employee.oid)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-800"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-slate-200 sm:text-sm">{employee.name ?? '未命名员工'}</span>
                    <span className="block truncate text-[11px] text-slate-400">{employee.email ?? '未提供邮箱'}</span>
                  </span>
                  <span className="max-w-[45%] truncate font-mono text-[10px] text-orange-300 sm:text-xs">{employee.oid}</span>
                </button>
              ))}
            </div>
          )}
        </form>

        <section className="pt-5">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-orange-400" />
            <h4 className="text-sm font-bold text-slate-200">当前企划人员</h4>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />正在加载权限名单...</div>
          ) : loadError ? (
            <div className="flex items-center gap-2 rounded-xl border border-rose-800/50 bg-rose-950/50 p-3 text-xs text-rose-300"><AlertCircle className="h-4 w-4 shrink-0" />{loadError}</div>
          ) : planners.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/30 p-5 text-center text-xs text-slate-400">暂无企划权限人员</div>
          ) : (
            <div className="space-y-2">
              {planners.map((planner) => (
                <div key={planner.oid} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-200 sm:text-sm">{planner.name ?? '未命名员工'}</p>
                    <p className="truncate text-[11px] text-slate-400">{planner.email ?? '未提供邮箱'}</p>
                    <p className="mt-1 break-all font-mono text-[10px] text-slate-500 sm:text-xs">OID: {planner.oid}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRevoke(planner.oid)}
                    disabled={revokingOid === planner.oid}
                    className="flex shrink-0 items-center justify-center gap-1.5 self-end rounded-lg border border-rose-900/70 bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-900/50 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
                  >
                    {revokingOid === planner.oid ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    撤销权限
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="mt-5 flex justify-end border-t border-slate-800 pt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isMutating}
            className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
