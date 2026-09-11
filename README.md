# 生产线平衡改善案例库

企业内网或企业 VPN 内的案例资料库。内部员工可以直接浏览、预览和下载当前案例；企划人员和管理员通过 Microsoft Entra ID 登录后维护案例与企划角色。

## 本地运行

安装依赖后，复制认证模板并填写本机使用的员工目录地址与 bootstrap 管理员邮箱：

```powershell
Copy-Item .env.auth.example .env
npm run dev
```

`VITE_*` 变量会被打包到浏览器，因此只能包含 tenant、应用 ID 和 API scope 等公开标识。不要添加 client secret；此 SPA 使用 Entra authorization-code flow with PKCE，API 直接验证 Entra access token。

## Microsoft Entra 应用注册

模板中的 tenant、SPA client 和 API client ID 是本项目的非机密应用标识。部署前在同一租户内完成以下配置。

1. 为 SPA 应用注册添加 **Single-page application** 平台，Redirect URI 填写实际站点根路径（本地开发通常为 `http://localhost:3000/`；生产例如 `https://cases.intra.example/`）。URI 必须与浏览器最终地址及 Vite base path 完全一致。
2. 在 API 应用注册的 **Expose an API** 中，将 Application ID URI 设为 `api://fbfa1a9d-ddcf-4f9f-abf8-64204f5d8db3`，创建 scope `access_as_user`，并允许用户或管理员同意。
3. 在 SPA 应用注册的 **API permissions** 中添加该 API 的 delegated `access_as_user` permission，并代表组织授予管理员同意（如租户策略要求）。维护请求必须取得这个 access token；ID token 不能替代它。

## 服务器配置与首次管理员

`.env.auth.example` 是完整的非机密配置模板：

- `EMPLOYEE_API_URL` 是仅服务器访问的内部员工目录 API；它不得暴露给浏览器。
- `EMPLOYEE_CACHE_TTL_SECONDS` 控制成功目录查询的缓存时间，默认 3600 秒；`EMPLOYEE_API_TIMEOUT_MS` 默认 10000 毫秒。
- `ALLOWED_DEPARTMENTS` 是逗号分隔的部门前缀白名单。目录记录必须存在、启用且部门匹配，才能取得维护资格。
- `SUPER_USER_EMAILS` 是逗号分隔的首次管理员邮箱。管理员首次成功登录时会获得本地管理员角色；之后由管理员通过受保护的角色 API 授予、调整或撤销企划人员角色。不要将 `data/auth.json` 当作密码或 token 存储。

生产环境应通过部署平台的环境变量设置这些值，而非提交 `.env`。员工目录不可用且没有可用缓存时，维护 API 会安全地返回 `503 DIRECTORY_UNAVAILABLE`。

## 企业网络边界

内部员工阅读不要求应用登录的前提，是服务只在企业内网或企业 VPN 中可达。将反向代理、负载均衡器、防火墙和 DNS 配置为仅允许受管企业网络访问；不要将读者 API、上传文件、预览或二维码链接公开到互联网。二维码也只应在连接企业内网或 VPN 的受管设备上使用。

## 验证

```powershell
npm run lint
npm test
npm run build
```
