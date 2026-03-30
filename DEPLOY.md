# 跑团问卷 — Cloudflare 部署说明

## 第一步：安装 Wrangler CLI

```powershell
npm install -g wrangler
wrangler login
```

## 第二步：创建 D1 数据库

```powershell
wrangler d1 create wenjuan-db
```

复制输出中的 `database_id`，填入 `wrangler.toml`：
```toml
database_id = "粘贴你的ID"
```

## 第三步：初始化数据库表

```powershell
# 本地测试用
wrangler d1 execute wenjuan-db --local --file=schema.sql

# 生产环境
wrangler d1 execute wenjuan-db --file=schema.sql
```

## 第四步：本地测试

```powershell
wrangler pages dev . --d1=DB=wenjuan-db
```

浏览器打开 `http://localhost:8788`

## 第五步：部署到 Cloudflare Pages

### 方式 A：GitHub（推荐）
1. 将项目推送到 GitHub 仓库
2. 进入 [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages → 新建项目
3. 连接 GitHub 仓库
4. **Build settings**：Build command 留空，Output directory 填 `.`
5. **绑定 D1**：Settings → Functions → D1 数据库绑定 → 变量名 `DB` → 选择 `wenjuan-db`
6. 保存并重新部署

### 方式 B：直接上传
```powershell
wrangler pages deploy . --project-name=wenjuan
```

## 项目文件结构

```
wenjuan/
├── index.html
├── _redirects
├── schema.sql
├── wrangler.toml
├── css/style.css
├── js/
│   ├── app.js
│   └── views/
│       ├── login.js
│       ├── home.js
│       ├── fill.js
│       ├── create.js
│       ├── edit.js
│       ├── results.js
│       └── surveyEditor.js
└── functions/
    └── api/
        ├── users.js
        ├── surveys.js
        └── surveys/
            ├── [id].js
            └── [id]/
                ├── responses.js
                └── results.js
```
