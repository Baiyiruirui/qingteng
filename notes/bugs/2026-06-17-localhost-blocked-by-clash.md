# localhost:3001 在浏览器访问失败,IP 直连可用

**日期**: 2026-06-17
**耗时**: ~15 分钟
**严重程度**: 低(不影响功能,影响开发体验)

## 现象

`pnpm dev` 启动 Next.js dev server 在端口 3001(3000 被占用)。

- http://localhost:3001 浏览器报 `ERR_CONNECTION_REFUSED`
- http://127.0.0.1:3001 同样不通
- http://192.168.1.85:3001 (局域网 IP) 正常访问

同时 curl 测试代理 7890 工作正常,说明网络栈本身没坏。

## 复现步骤

1. FIClash 处于规则模式或全局模式
2. 启动任意 Node.js 本地服务监听 localhost
3. 浏览器访问 localhost

## 排查过程

1. 误判为防火墙问题 → 检查 Windows 防火墙规则,无相关阻止 → 排除
2. 误判为端口冲突 → `netstat -ano | findstr :3001` 显示 Node 进程正常监听 → 排除
3. 想到 Clash 系软件可能拦截 localhost 流量 → 命中

## 根因

FIClash(Clash 系软件)的 TUN 模式或系统代理模式会拦截所有出站流量,**包括 localhost 回环流量**。请求被代理拿走但代理找不到外部目的地,所以 ERR_CONNECTION_REFUSED。

## 解法

FIClash 设置中"绕过局域网"或"Bypass 地址"添加:

```
localhost
127.0.0.1/8
*.local
```

保存后重启 FIClash 内核。

## 预防

- 每台开发机首次配置时,FIClash 立刻加上 localhost bypass,作为标准开发环境基线
- 未来如果切换代理工具(Surge/V2RayN),同样要确认 bypass 配置
