# Entra SSO 维护访问设计

## 目标与边界

实现 GitHub Issue #4：企划人员与管理员通过 Microsoft Entra ID 维护生产线平衡改善案例；企业网络边界内的内部员工继续免应用登录浏览、搜索、预览和下载案例。

本次不改变案例字段、上传与预览流程，亦不把读者路由纳入登录要求。维护端不再接受本地账号、密码或系统自签 token。

## 认证和资格

采用直接验证模式。React 使用 MSAL Redirect 获取 Entra access token，调用维护 API 时以 `Authorization: Bearer <token>` 传递。Express 从 Microsoft JWKS 验证 RS256 签名，并严格检查：

- `tid` 是配置的租户；
- issuer 为该租户的 v1 或 v2 issuer；
- audience 为 API client ID 或 `api://` Application ID URI；
- `scp` 含 `access_as_user`。

后端取得 `oid`、`preferred_username` 和 `name` 后，以 `oid` 优先、UPN 备援比对公司员工目录。目录资格按固定顺序判断：员工存在、`accountEnabled` 为 true、且在配置时部门前缀属于 `ALLOWED_DEPARTMENTS`。目录查询由后端代理，绝不向浏览器泄露上游 URL；成功结果缓存一小时。缓存尚有效时上游故障使用缓存，未命中且上游不可用则返回 `503 DIRECTORY_UNAVAILABLE`。

## 本地角色和 API

`data/auth.json` 从本地密码配置演进为本地角色记录，以 Entra `oid` 为唯一键保存管理员和企划人员授权。管理员具备企划角色的全部案例维护权限，并可通过受保护的角色管理 API 授予、调整或撤销企划权限。角色检查每次维护请求都从本地记录读取，因此变更立即生效。

新增 `GET /api/auth/me`，返回经过身份、目录资格和本地角色判定后的当前用户资料；它供前端恢复状态。令牌无效或缺失返回 401，目录资格不通过返回约定的 403 错误，非企划人员的案例写请求返回 403。健康检查与读者 API 继续无登录要求。

## 前端体验

维护入口保留为“企划登录”，点击后立即整页跳转到 Entra 登录页；回跳后页面从 `/api/auth/me` 获知本地角色。MSAL 使用 sessionStorage、Redirect 交互和动态 redirect URI。取消自定义账号密码表单、演示凭据、本地 token 持久化及“修改密码”入口。登出使用 `logoutRedirect()`。

当前 React 19.0.1 不在 MSAL React 当前支持的 peer range 内，因此先升级到 React 19.2.1，再使用受支持的 MSAL 5.x 版本。

## 配置与验证

新增 `.env.auth.example`：列出 Entra tenant/client/API/scope、前端来源、员工目录 URL、缓存 TTL、超时、允许部门和 bootstrap 管理员等配置。示例可使用已提供的应用标识，但不写入任何密钥。

测试覆盖 JWT/范围验证、目录资格（含缓存回退）、本地角色授权、管理员角色变更，以及读者 API 仍免登录。完成后执行类型检查、测试与生产构建，并提供 Azure Portal 的 SPA redirect URI、scope 与 API permissions 配置清单。
