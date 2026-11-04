# Fits_viewer

一个独立、本地运行的 FITS 图像查看器。网页由原生 HTML、CSS 和 JavaScript 组成，命令行启动器只使用 Python 标准库。它不需要 GalfitS、JAX、NumPy、Node.js 依赖包或远程服务。

## 功能

- 打开本地 FITS 文件，也可拖拽文件到图像区。
- 支持多个 HDU、数据 cube 的平面选择，以及常用的 FITS 数据类型和 `BSCALE` / `BZERO` / `BLANK`。
- 使用 sigma clipping 和 arcsinh 拉伸显示图像，提供 `seismic` 与 `gray` 色图。
- 根据 FITS WCS 显示参考 RA/Dec、目标像素、相对像素偏移和角度偏移。
- 显示 North/East 方向箭头，并提供可拖拽的图像区分隔栏。
- 快速估计椭圆中心、半光半径 Re、轴比 q、GalfitS Pa7 位置角和粗略 Sérsic index。
- `fits_viewer file.fits` 可通过一次性本地连接自动载入文件。文件不会上传到外部服务器。

## 直接从源码运行

需要 Python 3 和现代浏览器。Python 只用于启动浏览器和传递命令行指定的文件。

```bash
# 打开空白查看器
python3 fits_viewer_launcher.py

# 打开并自动载入 FITS
python3 fits_viewer_launcher.py /path/to/image.fits
```

也可以使用 shell 入口：

```bash
./bin/fits_viewer /path/to/image.fits
```

安装为全局终端命令、设置 alias、环境变量和界面参数见 [配置指南](docs/CONFIGURATION.md)。

## 测试

测试仅使用 Node.js 内置模块，不需要 `npm install`，也不依赖外部 FITS 样例。

```bash
node --test tests/test_fits_viewer.cjs
```

## 项目结构

```text
fits_viewer.html            独立网页和全部显示、解析、估计逻辑
fits_viewer_launcher.py     Python 标准库启动器
bin/fits_viewer             shell 命令入口
docs/CONFIGURATION.md       安装与配置指南
tests/test_fits_viewer.cjs  独立回归测试
```

## 适用范围

Re、q、PA 和 Sérsic index 是用于目测和拟合初值的快速估计，不是完整的二维 Sérsic 拟合。当前实现未进行 PSF 反卷积，会受背景、邻近源、有限估计半径和中心像素积分影响。高 Sérsic index 的估计尤其需要谨慎。

SIP 畸变会被检测并提示，但暂不应用于坐标计算。`.fits.gz` 文件需要先解压。
