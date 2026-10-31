# Offer Pilot 使用指南

[English](guide.md) | **中文**

> 适用版本：定时抓取和自动填表

一句话：**每天早上 7:00 自动抓职位 → 打开网页挑职位 → 点「自动填表」→ 检查标黄的项 → 自己点提交 → 回来点「已投递」。**

所有命令都在仓库根目录下运行：

```bash
cd web_offer_pilot
```

---

## 一、第一次使用（只做一次）

| 步骤 | 命令 / 操作 | 说明 |
|---|---|---|
| 1. 安装依赖 | `pnpm install` | 需要 Node 22+、pnpm |
| 2. 确认装了 Google Chrome | — | 自动填表用的是你电脑上的 Chrome |
| 3. 创建数据库 | `pnpm db:push` | 创建 `data/jobs.db` 和表（只需一次；以后表结构改了再运行） |
| 4. 个人资料 | `cp data/profile.example.json data/profile.json`，再编辑 | 写着 `TODO(confirm)` 的项不会自动填。这个文件不进 Git |
| 5. 来源和公司名单 | `cp data/sources.example.json data/sources.json` 和 `cp data/companies.example.json data/companies.json`，再编辑 | 把虚构样例换成你自己的（见 README）。这两个文件都不进 Git |
| 6. 简历 PDF | 放在 `data/resume/` | `profile.json` 里的 `resumePath` 指向它。简历更新后要重新导出 PDF，并改这个路径 |
| 7. 来源和第一个 Board | `pnpm dev`，点**添加来源**和**新建 Board** | 选模板再调整。要在第一次抓取之前做：只有 Board 匹配的职位才会保存描述 |
| 8. 定时抓取 | `pnpm schedule:install` | 每天 7:00 自动抓取。卸载：`pnpm schedule:uninstall` |

简历从 Word 转 PDF：

```bash
/Applications/LibreOffice.app/Contents/MacOS/soffice --headless --convert-to pdf --outdir data/resume 你的简历.docx
```

---

## 二、启动网页

```bash
pnpm dev            # 打开 http://localhost:3000
pnpm dev -p 3100    # 3000 端口被占用（EADDRINUSE）时换个端口
```

| 页面 | 地址 | 用途 |
|---|---|---|
| 来源 | `/` | 每个来源抓到多少职位、最近一次抓取的情况 |
| 你的 Board | `/boards/<名称>` | 每个 Board 匹配的职位；点**编辑**修改规则 |
| 新建 Board | `/boards/new` | 选模板或输入关键词和地点，实时预览 |

**切换语言**：网页默认显示英文，用右上角的 **中文 / EN** 按钮切换，选择会记在浏览器的 cookie 里（一年有效），网址不变。

Board 页面里的标签：**待处理**（新的、符合条件的）、**已投递**、**跳过**。可以按来源筛选，右上角能搜公司、职位、地点。

---

## 三、抓取职位

### 自动（推荐）
装好定时任务后，每天 7:00 自动运行，大约 3 分钟。日志在 `data/fetch.log`：

```bash
tail -30 data/fetch.log     # 看今天抓了多少、有没有出错
```

注意：Mac 在 7:00 处于睡眠状态时，会等到唤醒后再补跑。

### 手动
```bash
pnpm fetch-jobs
```

抓取会做这几件事：

1. 从你在来源页添加的来源拉职位：招聘系统连接器抓你跟踪的公司（`data/companies.json`），招聘网站连接器不需要公司名单。
2. 保存符合 Board 的职位描述（`src/lib/filter.ts`）。Board 的匹配结果在打开页面时才计算。
3. 去重：同一个职位出现在多个来源时，合并成一行。
4. 已经下线的职位会标为关闭，不再显示。

---

## 四、每天投递流程（半自动）

```
早上 7:00 自动抓取
   ↓
pnpm dev → 打开一个 Board →「待处理」
   ↓
点职位名称，看职位描述（先看地点：地点不合适的直接「跳过」）
   ↓
点「自动填表」→ 弹出 Chrome，自动填好能填的项
   ↓
检查整张表，补上标黄的项 → 自己点 Submit
   ↓
用完关掉标签页 → 回网页点「已投递」
```

### 1. 挑职位
- 合适的点 **自动填表**（或者 **打开申请页**，全部手动填）。
- 不合适的点 **跳过**。点错了，到对应标签页里点 **撤销**。
- 同一个职位在多个来源的会一起改状态。

### 2. 自动填表会做什么
点按钮后，程序在后台用一个**专用的 Chrome**（资料存在 `data/chrome-profile/`，和你日常用的 Chrome 分开）打开申请页，然后：

| 显示 | 含义 |
|---|---|
| 已填好 | 固定字段（姓名、邮箱、电话、LinkedIn、GitHub、简历），以及按规则匹配的常见问题（签证担保、工作许可、所在州、怎么知道这个职位、工作年限、时区、EEO 等） |
| **黄色框** | 必填、但程序没把握的题：公司特有的问题、开放问题、法律确认勾选框、日期选择器、"是否本地或愿意搬家" |
| 空着 | 选填、程序没有规则的题（比如 Twitter），想填可以自己填 |

**程序永远不会点提交。** 验证码（reCAPTCHA / hCaptcha）也由你在提交时处理。

### 3. 提交前检查清单
- [ ] 标黄的项全部填好
- [ ] 简历附件是最新版
- [ ] 下拉框选的值合理（尤其是 "How did you hear about us"，程序会挑最接近的选项）
- [ ] 开放问题（"Why us?" 等）认真写
- [ ] 自己点 Submit，看到成功页面
- [ ] 回 Offer Pilot 点 **已投递**

### 4. 支持哪些网站
| 申请页 | 能自动填吗 | 实测 |
|---|---|---|
| 有自动填表连接器的申请页 | ✅ | 真实表单：填好 11 到 22 项，公司专属问题标黄 |
| 要先登录的网站 | ❌ 只打开页面 | 登录或注册后自己填 |
| 其他网站 | ❌ 只打开页面 | 手动填 |

---

## 五、命令行用法（可选）

网页按钮背后运行的就是这个命令。想先看程序"打算怎么填"，可以用 `--dry-run`：

```bash
# 只打印填表计划，不打开浏览器
pnpm autofill <申请页链接> --dry-run

# 打开 Chrome 真正填（同样不会提交）
pnpm autofill <申请页链接>

# 也可以用数据库里的职位 id：<来源>:<公司>:<职位编号>
pnpm autofill <职位 id> --dry-run
```

输出里的标记：✅ 会自动填；🟡 要你填（会标黄）；⬜ 选填，跳过。`*` 表示必填。

---

## 六、常见问题

| 问题 | 解决 |
|---|---|
| 提示专用 Chrome 被占用 | 旧版本打开的 Chrome 窗口还开着，关掉后再点一次。正常情况下每个职位会在同一个窗口里开新标签页。详情见 `data/autofill.log` |
| 某项本来应该会填，却被标黄了 | 检查 `data/profile.json` 里这一项是不是还写着 `TODO(confirm)` |
| 下拉框选错了 | 手动改过来，再调整 `src/lib/autofill/rules.ts` 里的规则 |
| 今天没抓到新职位 | `tail data/fetch.log` 看有没有报错；手动跑 `pnpm fetch-jobs` |
| 网页打不开 | 确认 `pnpm dev` 还在运行；端口冲突就用 `pnpm dev -p 3100` |
| 想加公司 | **来源**页 → **跟踪的公司**，填公司名称和 slug，然后 `pnpm fetch-jobs` |
| 不想抓某个来源 | 在**来源**页关掉开关，或者点 × 移除 |
| Board 的职位太多或太少 | 点**编辑**，看着预览调整。关键词立即生效，按关键词搜索的来源要等下次抓取 |
| 改了代码里的模板 | 跑 `pnpm check-filter`，确认测试用例都通过 |

---

## 七、开发相关

```bash
pnpm test           # 全部测试（27 个：单元测试 + 浏览器测试 + 中英文词典，浏览器测试需要 Chrome）
pnpm test:unit      # 只跑单元测试
pnpm test:browser   # 只跑浏览器测试
pnpm lint
```

| 文件 | 内容 |
|---|---|
| `src/lib/autofill/classify.ts` | 按网址判断：直接填 / 要登录 / 手动 |
| `src/lib/autofill/rules.ts` | 常见问题的匹配规则 |
| `src/lib/autofill/` | 每个 ATS 一个计划生成器：读题并生成填表计划 |
| `src/lib/autofill/runner.ts` | 用 Playwright 在页面上执行填写、标黄 |
| `scripts/autofill.ts` | 命令行入口 |
| `scripts/schedule/` | 每天 7:00 定时抓取 |
| `src/i18n/dictionaries.ts` | 网页的中英文文案（加新文字时两种语言都要写，少写一种 TypeScript 会报错） |
| `src/i18n/locale.ts` | 从 cookie 读当前语言（默认英文） |

详细设计见 [README.zh-CN.md](../README.zh-CN.md)。
