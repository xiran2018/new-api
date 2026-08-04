# 独立首页

这是无需构建的静态首页，所有文件都在本目录。它不会进入 `core/new-api`，因此更新 upstream 不会与首页代码产生冲突。

## 本地预览

```bash
cd /home/jing/new-api-platform/extensions/homepage
bunx serve .
```

然后访问命令显示的地址。

## 部署与启用

项目的装配脚本会自动将本目录发布为 new-api 同域静态资源 `/home/`。执行：

```bash
cd /home/jing/new-api-platform
./scripts/rebuild-and-start.sh
```

独立首页会直接成为站点根路径 `/`，不需要、也不能再在 new-api 管理端的「系统设置 → 首页内容填充」中填写 URL；请保持该配置为空，避免 iframe 递归加载。

页面会按浏览器语言及系统主题显示。

## 修改内容

- 文案和链接：修改 `index.html`。
- 色彩、布局、响应式样式：修改 `styles.css`。
- 轮播项和语言字典：修改 `app.js`。
- 图片：推荐添加压缩后的 WebP/AVIF 到本目录的 `assets/`，再在 `index.html` 中以相对路径引用；不要依赖不可控的第三方图片链接。

若希望管理端直接维护轮播图、图片与文案，下一步可在 `extensions/` 中增加首页管理页与 `platform_db` 配置表；这仍不需要修改 core 首页。
