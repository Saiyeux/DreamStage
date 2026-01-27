# 日志目录

此目录存放应用运行日志。

## 日志文件说明

- `app.log` - 所有级别的日志（INFO及以上）
- `debug.log` - 调试日志（DEBUG及以上），包含详细的场景分析信息
- `error.log` - 仅错误日志（ERROR及以上）

## 日志格式

```
时间戳 | 级别 | 模块名:行号 | 消息内容
```

示例：
```
2026-01-27 22:30:15 | INFO     | app.api.analysis:282 | 项目 abc123 - 合并后共 47 个场景
2026-01-27 22:30:15 | DEBUG    | app.api.analysis:290 | 保存场景 1/47: 原编号 1 -> 新编号 1, 地点: 咖啡厅
```

## 日志轮转

- 单个日志文件最大 10MB
- 保留最近 5 个备份文件
- 自动轮转，无需手动清理

## 查看日志

**查看最新的日志**:
```bash
# Windows
type logs\debug.log | more

# Linux/Mac
tail -f logs/debug.log
```

**搜索特定内容**:
```bash
# Windows
findstr "场景" logs\debug.log

# Linux/Mac
grep "场景" logs/debug.log
```

**查看错误日志**:
```bash
type logs\error.log
```
