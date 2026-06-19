# Cyberboss 版本更新说明

---

## v0.1.0-wip (2026-06-18)

### 🐛 Windows 修复

#### IPC 通信层：Unix Socket → TCP
- **问题：** Windows 上 Node.js 在 `%HOME%/.cyberboss/` 下创建 Unix domain socket 报 `EACCES: permission denied`
- **修复：** Windows 平台改用 TCP `127.0.0.1:18765`，Linux/Mac 保持 Unix socket
- **涉及文件：**
  - `src/adapters/runtime/claudecode/ipc-server.js` — 双模式：Windows TCP / 其他 Unix socket
  - `src/adapters/runtime/claudecode/index.js` — 传入 `stateDir` 给 IPC server
  - `scripts/shared-open.js` — Windows 读端口连 TCP，其他平台用 Unix socket

### ⚙️ 配置

#### .env 初始化
- 创建 `D:\Cyberboss\cyberboss\.env`，包含：
  - `CYBERBOSS_USER_NAME=小方`
  - `CYBERBOSS_USER_GENDER=male`
  - `CYBERBOSS_ALLOWED_USER_IDS=chzxk666`
  - `CYBERBOSS_WORKSPACE_ROOT=D:\Cyberboss`
  - `CYBERBOSS_RUNTIME=claudecode`
  - `CYBERBOSS_CLAUDE_PERMISSION_MODE=default`
  - `CYBERBOSS_VISION_MODE=off`
  - `CYBERBOSS_ENABLE_LOCATION_SERVER=false`
  - `CYBERBOSS_ACCOUNT_ID=aabba842c424-im.bot`

### ✅ 已验证
- `npm run doctor` 通过
- `npm run login` 成功（accountId: `aabba842c424-im.bot`）
- `weixin-instructions.md` 已用正确性别（他/小方）重新生成

### ⚠️ 待验证
- `npm run shared:start` + `npm run shared:open` — IPC 修复后需重新启动验证
