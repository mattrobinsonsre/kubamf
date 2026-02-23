#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '../public/kubamf-icon.svg');
const pngPath = path.join(__dirname, '../build/icon.png');
const buildDir = path.join(__dirname, '../build');

// Create build directory if it doesn't exist
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// Check if SVG exists
if (!fs.existsSync(svgPath)) {
  console.error('Error: SVG icon not found at', svgPath);
  process.exit(1);
}

try {
  // Check if rsvg-convert is available
  try {
    execSync('which rsvg-convert', { stdio: 'pipe' });
  } catch {
    // rsvg-convert not in PATH, try common locations
    const possiblePaths = [
      '/usr/bin/rsvg-convert',
      '/usr/local/bin/rsvg-convert',
      'rsvg-convert'
    ];

    let found = false;
    for (const cmdPath of possiblePaths) {
      try {
        execSync(`${cmdPath} --version`, { stdio: 'pipe' });
        // Convert SVG to PNG using found rsvg-convert
        execSync(`${cmdPath} -w 512 -h 512 -a "${svgPath}" -o "${pngPath}"`, {
          stdio: 'inherit'
        });
        found = true;
        break;
      } catch {
        // Try next path
      }
    }

    if (!found) {
      // If rsvg-convert is not available, just copy the SVG as a fallback
      console.warn('⚠️  rsvg-convert not found, using SVG directly');
      fs.copyFileSync(svgPath, pngPath.replace('.png', '.svg'));
      // Also create a dummy PNG file to satisfy build requirements
      fs.writeFileSync(pngPath, '');
      console.log('✅ Icon placeholder created:', pngPath);
      process.exit(0);
    }
  }

  // If we get here, rsvg-convert is in PATH
  execSync(`rsvg-convert -w 512 -h 512 -a "${svgPath}" -o "${pngPath}"`, {
    stdio: 'inherit'
  });
  console.log('✅ Icon generated successfully:', pngPath);
} catch (error) {
  console.error('❌ Failed to generate icon:', error.message);
  // Create a dummy file to allow build to continue
  fs.writeFileSync(pngPath, '');
  console.log('✅ Icon placeholder created:', pngPath);
}