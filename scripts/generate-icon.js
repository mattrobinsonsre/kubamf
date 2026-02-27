#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const svgPath = path.join(__dirname, '../public/kubamf-icon.svg');
const pngPath = path.join(__dirname, '../build/icon.png');
const icnsPath = path.join(__dirname, '../build/icon.icns');
const buildDir = path.join(__dirname, '../build');

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

if (!fs.existsSync(svgPath)) {
  console.error('Error: SVG icon not found at', svgPath);
  process.exit(1);
}

// Find rsvg-convert
function findRsvgConvert() {
  const candidates = [
    'rsvg-convert',
    '/opt/homebrew/bin/rsvg-convert',
    '/usr/bin/rsvg-convert',
    '/usr/local/bin/rsvg-convert'
  ];
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { stdio: 'pipe' });
      return cmd;
    } catch {
      // try next
    }
  }
  return null;
}

const rsvg = findRsvgConvert();

if (!rsvg) {
  // No rsvg-convert — keep existing icon if valid, otherwise create placeholder
  if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 1000) {
    console.warn('⚠️  rsvg-convert not found, keeping existing icon:', pngPath);
    process.exit(0);
  }
  console.warn('⚠️  rsvg-convert not found, using SVG directly');
  fs.copyFileSync(svgPath, pngPath.replace('.png', '.svg'));
  process.exit(0);
}

// Generate 512x512 PNG
try {
  execSync(`${rsvg} -w 512 -h 512 -a "${svgPath}" -o "${pngPath}"`, { stdio: 'inherit' });
  console.log('✅ Icon generated:', pngPath);
} catch (error) {
  console.error('❌ Failed to generate PNG icon:', error.message);
  process.exit(1);
}

// On macOS, also generate ICNS via iconutil
if (os.platform() === 'darwin') {
  try {
    const iconsetDir = path.join(os.tmpdir(), 'kubamf-icon.iconset');
    fs.mkdirSync(iconsetDir, { recursive: true });

    const sizes = [16, 32, 64, 128, 256, 512];
    for (const size of sizes) {
      execSync(`${rsvg} -w ${size} -h ${size} -a "${svgPath}" -o "${iconsetDir}/icon_${size}x${size}.png"`, { stdio: 'pipe' });
    }
    // @2x variants
    const retinaPairs = [[16, 32], [32, 64], [128, 256], [256, 512]];
    for (const [logical, actual] of retinaPairs) {
      const src = path.join(iconsetDir, `icon_${actual}x${actual}.png`);
      const dst = path.join(iconsetDir, `icon_${logical}x${logical}@2x.png`);
      if (fs.existsSync(src)) fs.copyFileSync(src, dst);
    }

    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: 'pipe' });
    console.log('✅ ICNS icon generated:', icnsPath);

    // Cleanup
    fs.rmSync(iconsetDir, { recursive: true, force: true });
  } catch (error) {
    console.warn('⚠️  Failed to generate ICNS:', error.message);
    // Non-fatal — electron-builder can convert PNG to ICNS
  }
}
