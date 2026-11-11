# 第三方代码与许可证

本项目（`game-hub`）自身代码以 [MIT](./LICENSE) 授权。下面列出被复制进
`runner/vendor/` 的上游代码，以及各自的授权与改动说明。分发时这些文件与其
`LICENSE` 必须一并保留。

## 王者荣耀：GloryOfKings-Plugin

- 仓库：<https://gitee.com/Tloml-Starry/GloryOfKings-Plugin>
- 许可证：MIT（Copyright (c) 2026 小丞），原文见 `runner/vendor/kog/LICENSE`
- 引入文件：

  | 本项目路径 | 上游来源 | 改动 |
  | --- | --- | --- |
  | `runner/vendor/kog/wechatLogin.js` | 扫码登录模块 | 仅改写 import：`node-fetch` → `lib/fetch.mjs`，`#components` → `lib/alx-shim.mjs`，`./authStore.js` → `lib/alx-authstore.mjs`；补 `logger` 导入 |
  | `runner/vendor/kog/api.js` | 营地数据接口（RSA 分块加密 + XXTEA 解密） | 同上，仅改 import |
  | `runner/vendor/kog/xxtea.js` | XXTEA 解密 | 无改动 |

  业务逻辑未修改，仅调整宿主依赖。

## 和平精英：PUBG-Helper-Plugin

- 仓库：<https://github.com/TciFurh/PUBG-Helper-Plugin>
- 许可证：木兰宽松许可证第 2 版（MulanPSL-2.0），原文见 `runner/vendor/pubg/LICENSE`
- 引入文件：

  | 本项目路径 | 上游来源 | 改动 |
  | --- | --- | --- |
  | `runner/vendor/pubg/wxQrLogin.js` | 微信扫码登录 | 仅改写 import 指向本项目的 shim 与 fetch 兼容层 |

## 无畏契约：Valorant-Plugin

- 仓库：<https://github.com/Looking08/Valorant-Plugin>
- 许可证：MIT（Copyright (c) 2026 Looking08）
- 引入方式：**未复制代码**。`runner/games/val.mjs` 中的掌瓦扫码链路
  （`get_sdk_ticket` → `qrconnect` → `login_by_wechat`）是按上游公开的实现思路
  重写的独立实现，只沿用了同样的接口路径与 `appid`。

## 数据来源

- 王者荣耀英雄与战力：`kohcamp.qq.com` / `ssl.kohsocialapp.qq.com`
- 和平精英：`formal.api.gp.qq.com`
- 无畏契约英雄与地图：<https://valorant-api.com>（第三方公开数据集）

上述接口与数据版权归各自权利人所有，本项目只做客户端侧调用，不存储、不再分发。
