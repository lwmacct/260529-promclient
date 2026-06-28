# Agent 规则

## 发版

- 修改本共享库后，使用 `task git:tag:next` 创建并推送新版本标签。
- 该库被多个项目复用；新增能力优先保持通用 API，避免写入单一业务项目的特化逻辑。
- 发版前先运行 `npm run typecheck` 和 `npm run build`。
