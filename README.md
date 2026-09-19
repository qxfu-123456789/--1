# 天空的伤口 · 南极上空的臭氧之谜

一个科学推理网页游戏：24 页推理故事、6 个互动问题，沿着真实研究足迹破获南极臭氧洞之谜。

## 进入游戏

GitHub Pages 发布：**https://qxfu-123456789.github.io/--1/**

无需登录，进度保存在当前浏览器（localStorage）。

## 怎么玩

- 按页阅读；走到转折处会出现互动问题。
- 答错会出现针对性反馈，可立即重答；也可先看提示（用提示答对该题记 30 分）。
- 计分：首次独立答对 100 分，纠错后答对 60 分，借助提示答对 30 分；最终成绩为六题平均，四舍五入。
- 关键证据自动收入「线索本」。支持音效开关与解析朗读（浏览器语音合成）。

## 科学内容依据

故事基于公开科学史写成，关键节点均有原始文献：

- Rowland & Molina, *Nature* (1974)：CFC 光解与氯催化循环
- Farman, Gardiner & Shanklin, *Nature* (1985)：哈雷站春季臭氧下降约 40%
- Solomon et al. (1986)：极地氯化学假说；Molina, Molina, Tolbert & Watson (1987)：PSC 表面异相反应
- Anderson et al., *JGR* (1989)：ER-2 观测 ClO–O₃ 反相关
- 1987 年《蒙特利尔议定书》；UNEP/WMO 臭氧评估（2022）：恢复时间预测

页面中的图表为依据历史数据趋势的示意重绘，不是原始论文图件。

## 成绩、排行榜与评论

- 通关后可在「调查档案」页自愿上传成绩：游戏会在新标签页打开本仓库的 Issue 草稿（自动填好记录），**由玩家本人登录 GitHub 核对并提交**。
- 排行榜与留言板由公开 Issues 自动生成（`.github/workflows/community.yml` 定期把 Issues 汇总为 `community/scores.json` 快照）；前端优先读快照，失败时回退到 GitHub Issues API。
- 成绩为玩家自报记录，用于交流，不作为考核凭证。关闭对应 Issue 即可从榜单/留言板撤回。

## 本地运行 / 离线游玩

静态站点，无构建步骤。任选其一：

```bash
# 方式一：直接打开
open index.html        # macOS
start index.html       # Windows

# 方式二：本地服务器
python -m http.server 8000
# 浏览器访问 http://localhost:8000
```

文件结构：

```
index.html      入口
style.css       样式
data.js         剧情与题目数据（24 页）
app.js          游戏引擎（阅读/问答/计分/社区）
community/      榜单快照生成器（lib.mjs / sync.mjs / 测试）
.github/        Issue 模板与 Actions 工作流
```

## 许可

代码与文本以 [MIT](LICENSE) 发布。游戏为独立原创作品，仅参考了 socrates-question 的玩法机制（Issues 驱动的社区模式、答错反馈可重答的计分规则）。
