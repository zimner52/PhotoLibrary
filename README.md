![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
# 图片库 PhotoLibrary

用于管理图片，支持添加、删除、修改图片。<br>
Using for managing images, supporting adding, deleting, and modifying images.

## 目录

- [项目说明](#项目说明)
- [功能](#功能)
- [用法](#用法)
  - [环境要求](#环境要求)
  - [安装与运行](#安装与运行)
  - [数据存放地址](#数据存放地址)
- [开源协议](#开源协议)

## 项目说明
项目主要是写来自用的，不保证代码的健壮性和安全性，但如果你在使用中发现了问题，欢迎提交 issue 或 pull request。<br>
未来可能会添加快捷下载方式然后把自动导入踢掉。<br>
This project is mainly written for personal use, and I do not guarantee the robustness and security of the code.
But if you find any problems while using it, welcome to submit an issue or pull request.<br>
In the future, I may add a quick download feature and get rid of the automatic import.<br>



## 功能

- **自动导入**：把「下载目录」指向浏览器保存图片的位置并打开开关，之后浏览器下载的图片会自动压缩入库，不用手动添加。默认指向系统下载目录。
- **标签**：一张图可以有多个标签。侧边栏按标签筛选（带使用次数），输入时用**空格分隔**可以连续添加。标签和分类筛选是叠加关系。
- **打包图片**：把整个图库打成 ZIP，并在包里附一份只含 `name` / `sourceUrl` / `referer` 的索引 json。
- **下载图片**：选择打包图片产出的索引 json，按里面的地址 + referer 把图片**批量重新下载**入库。
- **auto import**：Point the "Download directory" to the browser's download directory and turn on the switch. After that, images downloaded by the browser will be automatically compressed and stored. No manual addition is required. The default is the system download directory.
- **tag**：One image can have multiple tags. Sidebar filters by tag (with usage count), and tags can be added continuously when inputting. The tag and category filters are cumulative relationships.\
- **pack images**：Pack the entire library into a ZIP file, and include an index JSON file in the package that contains only `name` / `sourceUrl` / `referer`.
- **download images**：Select the index JSON file produced by the pack images feature, and download the images **batch re-download** based on the address and referer in the file.

## 用法

### 环境要求

- **Node.js** `^20.19.0 || >=22.12.0`。
- **Windows**：打包走 NSIS 安装包；「下载来源」依赖 NTFS 的备用数据流，非 NTFS 磁盘上这个功能会失效（其余功能正常）。
- 首次 `npm install` 要下载 `sharp` 的原生二进制与 Electron 发行包，需要联网。

### 安装与运行

在**本 README 所在目录**（仓库根，package.json 在它下面的 `src/`）执行：

```sh
cd src
npm install
npm start
```

### 数据存放地址

`%APPDATA%\PhotoLibrary\`：

| 路径 | 内容 |
| --- | --- |
| `db.json` | 图片元数据：名称、标签、所属文件夹、来源、入库时间 |
| `config.json` | 自动导入设置 + 当前图库根目录 |
| `images\Ori\` | 原图 |
| `images\Thumb\` | 缩略图 |

## 开源协议

[MIT](LICENSE) © hei
