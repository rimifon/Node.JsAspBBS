# Node.JsAspBBS

## 简介
这是一个 node 版的 “IIS”，仅一个 index.js 文件就实现了 Web 服务器功能，支持经典的 JScript 版 asp 语法，并实现了 #include 指令、Session处理、应用缓存等。
ASP 对象方面，提供了常用的 Response.Write, Response.Redirect, Request.Form, Request.QueryString, Request.ServerVariables, Server.MapPath 等方法。
Application 缓存和 Session 处理方面，分别使用了 cc() 和 ss() 方法实现。
内置了 API 文档 + 调试功能，可快速开发部署您的 API，并在浏览器中查阅和调试 API。
内置了 性能监控功能(stat.asp)，可以查看每个请求的耗时，并生成了慢日志。
内置了 数据库链式操作，可以方便的操作数据库，并且支持事务处理。
以上所有功能，都是基于经典ASP版框架的二次实现，所以，为 ASP 代码 在 node 与 IIS 中互相迁移提供了可行性。

## 特性
模板编译运行功能，让你的 ASP 以最快的性能运行。第一次请求 ASP 时，会自动解析模板并编译成 function 方法，后续请求时，会直接执行编译后的 function。同时监控了依赖文件的修改，如果有修改，会自动重新编译。
支持运行多个网站，打开 index.js，编辑第四行，即可添加多个站点。
可以在全平台（x64, arm, linux, windows, bsd）运行。
语法同时兼容 JScript 和 ES6，可以在 ASP 中使用 async/await 和 generator 函数，也能 require 各种 node 模块帮您处理复杂业务。

## 运行环境
以下环境测试通过：
- Linux + nodejs 16.15
- Windows + nodejs 16.13
- Android + termux + proot-distro + alpine + nodejs 16.15

## 演示地址
- 演示及讨论，可进入 [228mi.com:1280](http://228mi.com:1280/)

## 启动命令
进入 Node.JsAspBBS 目录，运行：
``` bash
node .
```
默认 HTTP 端口为 3000。支持 HTTPS（证书 key 文件需要使用 pem 格式），如需启动 HTTPS 服务，请在命令行中指定：
``` bash
node . 80 443
```
80 为 HTTP 侦听端口，443 为 HTTPS 侦听端口。（注意：1024以下的端口需要管理员权限）
推荐使用 pm2 管理服务启动（需 npm i -g pm2 安装pm2），如：
``` bash
pm2 start .
```

默认数据库为 SQLite，第一次使用数据库，需要先安装 better-sqlite3 模块（异步版为 sqlite3）：
``` bash
npm install better-sqlite3
#yarn add better-sqlite3   # 或者用 yarn 安装
```