// 自动确保 Tauri 图标齐全，避免 Linux 上无应用图标
// - 检查 src-tauri/icons/icon.png 是否存在且尺寸>=256（推荐512）
// - 若缺失或过小：调用本地 @tauri-apps/cli 生成全量图标集

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const projectRoot = process.cwd();
const iconsDir = path.join(projectRoot, 'src-tauri', 'icons');
const iconPng = path.join(iconsDir, 'icon.png');
const iconIco = path.join(iconsDir, 'icon.ico');
const source = path.join(projectRoot, 'Flymdnew.png');

function getPngSize(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.length < 24) return null;
    const pngSig = '89504e470d0a1a0a';
    if (b.slice(0, 8).toString('hex') !== pngSig) return null;
    // IHDR 紧随签名，结构: length(4) + 'IHDR'(4) + width(4) + height(4)
    const ihdr = b.indexOf(Buffer.from('IHDR'));
    if (ihdr < 0 || ihdr + 12 > b.length) return null;
    const w = b.readUInt32BE(ihdr + 4);
    const h = b.readUInt32BE(ihdr + 8);
    return { w, h };
  } catch (_) {
    return null;
  }
}

function ensureIcons() {
  const want = 256; // 最低 256，CI 会生成 512
  let needGen = false;

  if (!fs.existsSync(iconsDir)) {
    needGen = true;
  }
  if (!fs.existsSync(iconPng)) {
    needGen = true;
  }
  if (!fs.existsSync(source)) {
    console.warn(`[ensure-icons] 警告：源图标不存在: ${source}`);
  }

  if (!needGen && fs.existsSync(iconPng)) {
    const sz = getPngSize(iconPng);
    if (!sz || sz.w < want || sz.h < want) {
      console.log(`[ensure-icons] icon.png 尺寸 ${sz ? `${sz.w}x${sz.h}` : '未知'} < ${want}，需要重新生成`);
      needGen = true;
    }
  }

  // ICO 粗略检查（文件过小通常无效）
  if (!needGen && fs.existsSync(iconIco)) {
    const stat = fs.statSync(iconIco);
    if (stat.size < 1000) {
      console.log(`[ensure-icons] icon.ico 体积异常(${stat.size}B)，需要重新生成`);
      needGen = true;
    }
  }

  if (!needGen) {
    console.log('[ensure-icons] 图标已满足要求，跳过生成');
    return true;
  }

  // 生成：优先使用本地 CLI，避免 npx 触网
  const cliJs = path.join(projectRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
  const hasLocalCli = fs.existsSync(cliJs);

  const args = ['icon'];
  if (fs.existsSync(source)) args.push(source);

  console.log(`[ensure-icons] 生成图标：${hasLocalCli ? `node ${path.relative(projectRoot, cliJs)}` : 'tauri'} ${args.join(' ')}`);

  try {
    if (hasLocalCli) {
      const r = cp.spawnSync(process.execPath || 'node', [cliJs, ...args], {
        stdio: 'inherit',
        cwd: projectRoot,
        env: process.env,
      });
      if (r.status !== 0) throw new Error(`exit ${r.status}`);
    } else {
      // 回退到全局 tauri（需用户环境已安装）
      const r = cp.spawnSync('tauri', args, { stdio: 'inherit', cwd: projectRoot, env: process.env });
      if (r.status !== 0) throw new Error(`exit ${r.status}`);
    }
  } catch (e) {
    console.error(`[ensure-icons] 生成失败：${e.message}`);
    // 不阻断构建，仅给出提示
    return false;
  }

  // 确认生成结果
  const ok = fs.existsSync(iconPng) && fs.existsSync(iconIco);
  console.log(`[ensure-icons] 生成完成：${ok ? 'OK' : '未检测到关键文件（icon.png/icon.ico）'}`);
  return ok;
}

ensureIcons();
