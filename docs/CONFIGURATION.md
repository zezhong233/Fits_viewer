# Fits_viewer 配置指南

## 1. 运行要求

- 一个支持 Canvas、File API 和 ResizeObserver 的现代浏览器。
- 直接双击 `fits_viewer.html` 时，不需要 Python 或 Node.js。
- 从终端启动时，需要 Python 3 和 POSIX `sh`。
- 运行测试时，需要 Node.js 18 或更新版本。
- 不需要安装任何第三方 Python 或 Node.js 包。

macOS 是当前主要验证平台。其他系统可以直接打开 HTML；终端启动器是否可用取决于系统的 Python、`sh` 和浏览器配置。

## 2. 三种使用方式

### 2.1 只打开网页

直接用浏览器打开 `fits_viewer.html`，然后点击“打开 FITS”，或把 FITS 文件拖入图像区。

这种方式完全离线，适合手动选择文件。

### 2.2 从源码目录运行

在项目根目录执行：

```bash
python3 fits_viewer_launcher.py
python3 fits_viewer_launcher.py /path/to/image.fits
```

也可以执行：

```bash
./bin/fits_viewer
./bin/fits_viewer /path/to/image.fits
```

带文件参数时，启动器在 `127.0.0.1` 的随机端口启动一次性本地服务。浏览器只获取网页和你指定的 FITS 文件。文件发送完成后，服务自动关闭。

### 2.3 安装为终端命令

在项目根目录执行：

```bash
install -d "$HOME/.local/share/galfits" "$HOME/.local/bin"
install -m 644 fits_viewer.html fits_viewer_launcher.py \
  "$HOME/.local/share/galfits/"
install -m 755 bin/fits_viewer "$HOME/.local/bin/fits_viewer"
```

如果 `$HOME/.local/bin` 已在 `PATH` 中，可以直接使用：

```bash
fits_viewer
fits_viewer /path/to/image.fits
```

## 3. 配置 bash alias

如果希望在 bash 中明确指定命令位置，在 `~/.bashrc` 中加入：

```bash
alias fits_viewer='$HOME/.local/bin/fits_viewer'
```

然后执行：

```bash
source ~/.bashrc
```

如果 `~/.bash_profile` 尚未加载 `~/.bashrc`，加入：

```bash
if [ -f "$HOME/.bashrc" ]; then
    source "$HOME/.bashrc"
fi
```

使用 zsh 时，可以把同样的 alias 放入 `~/.zshrc`，然后执行 `source ~/.zshrc`。

也可以不设置 alias，只把安装目录加入 `PATH`：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

alias 和 `PATH` 都能启动命令，按个人习惯选择即可。

## 4. 界面参数

| 参数 | 默认值 | 说明 |
|---|---:|---|
| 图像 HDU | 第一个图像 HDU | 文件含多个图像 HDU 时可切换 |
| Cube 平面 | 0 | 对三维数据选择要显示的平面，从 0 开始 |
| 下限 × σ | 5 | 显示下限为背景噪声标准差的倍数 |
| 上限 × σ | 空白 | 空白时使用图像最大值；填入数值时按该倍数计算 |
| frac | 0.4 | arcsinh 拉伸参数，范围 0–1 |
| 色图 | seismic | 可切换为 gray |
| 估计半径 | 图像短边的约四分之一 | 最小为 3 像素，影响 Re 和 Sérsic index 等结果 |
| 面板宽度 | 左右等宽 | 拖动中央分隔线调整，图像随可用空间缩放 |

界面设置只对当前页面会话有效，不会写入配置文件。

## 5. 显示归一化

网页先用 3σ 阈值进行 5 次 sigma clipping，估计背景中位数和噪声。默认显示下限为 $5\sigma$，上限为图像最大值，再应用 arcsinh 拉伸和所选色图。

图像原点位于左下。画布保持 FITS 的原始宽高比，不会因为面板拖拽而拉伸变形。方向箭头、选择十字和估计椭圆使用独立的高分辨率 overlay。

## 6. 坐标约定

- 参考像素取自 `CRPIX1` 和 `CRPIX2`，参考天球坐标取自 `CRVAL1` 和 `CRVAL2`。
- 页面读数中的 FITS 像素坐标从 1 开始，内部计算从 0 开始。
- $\Delta X$ 和 $\Delta Y$ 是目标像素减参考像素。
- $\Delta RA=(RA-RA_0)\times3600$，单位为角秒，**不乘 $\cos\delta$**。
- $\Delta Dec=(Dec-Dec_0)\times3600$，单位为角秒。
- 支持 CD 矩阵，或 PC 矩阵与 CDELT。
- 支持 TAN、SIN 和 ARC 投影。
- GalfitS Pa7 使用 North = 0°、East = 90°，并按 180° 取模。

检测到 SIP 关键字时，页面会给出警告，但当前不会应用 SIP 修正。

## 7. Re、q、PA 和 Sérsic index

点击星系中心附近，再点击“估计 Re / q / n”。未选择像素时，使用 header 参考像素。

- 中心与 q：来自高于背景 $3\sigma$ 的八连通区域及其流量加权二阶矩。
- Re：在所选估计半径内，背景扣除累计流量达到一半时的椭圆半长轴。
- PA：由椭圆主轴方向经过局部 WCS 转换得到。
- Sérsic index：由同一累计流量曲线的 $R_{80}/R_{20}$ 集中度反解，搜索范围为 0.5–6。

蓝色实线表示 Re，橙色实线表示当前估计半径。两圈使用相同中心、轴比和 PA。

这些结果适合目测和拟合初值。它们不是完整二维拟合的结果，未做 PSF 反卷积。有限光圈、噪声、邻近源和中心像素积分都会影响结果，高 Sérsic index 尤其不稳定。显示“边界”时，表示估计已经达到搜索范围的端点。

### 导出到 `.lyric`

有有效 WCS 和完整估计结果时，结果面板会显示六行可复制的参数：

```text
Pa3) [delta_RA, min, max, step, 0]
Pa4) [delta_Dec, min, max, step, 0]
Pa5) [Re_arcsec, min, max, step, 0]
Pa6) [n, min, max, step, 0]
Pa7) [PA_deg, min, max, step, 0]
Pa8) [q, min, max, step, 0]
```

点击“复制参数”即可复制整段文本。中心偏移使用估计中心相对 CRVAL 的偏移，$\Delta RA$ 不乘 $\cos\delta$，与 GalfitS 的中心坐标转换约定一致。

默认中心偏移范围为估计值前后各 $0.4''$，Re 下限约为 0.3 像素，n 范围为 0.2–8，PA 范围为 −180–180°，q 上限为 1。非零参数的步长为 $|value|/10$；零中心偏移和零 PA 使用备用步长。

文本默认用于第一个 Profile（`Pa`），末位 `vary` 均设为 0。使用其他 Profile 时需要修改前缀。此导出假定 `.lyric` 的 `R2)` 与 FITS 的 CRVAL 相同；如果参考天球坐标不同，需要重新计算 `Pa3)` 和 `Pa4)`。

## 8. 可选环境变量

### `FITS_VIEWER_HTML`

指定 Python 启动器使用的 HTML 文件：

```bash
export FITS_VIEWER_HTML="$HOME/path/to/fits_viewer.html"
```

默认使用与 `fits_viewer_launcher.py` 位于同一目录的 `fits_viewer.html`。

### `FITS_VIEWER_LAUNCHER`

指定 shell 入口使用的 Python 启动器：

```bash
export FITS_VIEWER_LAUNCHER="$HOME/path/to/fits_viewer_launcher.py"
```

默认优先使用项目根目录中的启动器；安装到 `~/.local/bin` 后，使用 `~/.local/share/galfits/fits_viewer_launcher.py`。

## 9. 支持的 FITS 数据

- `BITPIX`：8、16、32、64、-32、-64。
- 支持 `BSCALE`、`BZERO` 和 `BLANK`。
- 支持多 HDU 和 cube 平面选择。
- 当前不支持直接读取 `.fits.gz`，需要先解压。

## 10. 常见问题

### 终端提示 `getcwd: cannot access parent directories`

终端当前所在目录已被删除或断开。先执行：

```bash
cd "$HOME"
```

这与 FITS 文件本身无关。

### 修改 alias 后找不到命令

在当前终端重新加载配置：

```bash
source ~/.bashrc
```

并检查安装文件是否存在：

```bash
ls -l "$HOME/.local/bin/fits_viewer"
```

### 带文件参数打开后，刷新页面无法重新载入

一次性本地服务已经在文件发送后关闭。重新运行：

```bash
fits_viewer /path/to/image.fits
```

### 如何恢复默认面板位置

重新打开网页。默认分隔线位于中央，拖拽宽度不会持久保存。

## 11. 开发与测试

```bash
node --test tests/test_fits_viewer.cjs
```

测试数据全部由测试脚本生成，不需要 GalfitS_dev、外部 FITS 样例或任何 npm 包。
