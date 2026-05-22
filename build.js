const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== Discord Bot Manager - Build .exe ===\n');

const required = [
  'main.js', 'preload.js', 'bot-manager.js',
  'public/index.html', 'public/styles.css', 'public/renderer.js',
  'package.json',
];

let ok = true;
for (const f of required) {
  if (!fs.existsSync(path.join(__dirname, f))) {
    console.log(`[MISSING] ${f}`);
    ok = false;
  }
}
if (!ok) { console.error('\nMissing files. Aborting.'); process.exit(1); }

console.log('All required files found.\n');

const iconDir = path.join(__dirname, 'build');
if (!fs.existsSync(iconDir)) fs.mkdirSync(iconDir, { recursive: true });

const iconPngPath = path.join(iconDir, 'icon.png');
const iconIcoPath = path.join(iconDir, 'icon.ico');
if (!fs.existsSync(iconPngPath)) {
  console.log('Generating default icon...');
  try {
    const sharp = (() => { try { return require('sharp'); } catch { return null; } })();
    if (sharp) {
      const svg = Buffer.from(`
        <svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
          <rect width="256" height="256" rx="48" fill="#8b7cf7"/>
          <rect x="48" y="64" width="160" height="112" rx="16" fill="none" stroke="white" stroke-width="8"/>
          <line x1="88" y1="196" x2="168" y2="196" stroke="white" stroke-width="8" stroke-linecap="round"/>
          <line x1="128" y1="176" x2="128" y2="196" stroke="white" stroke-width="8" stroke-linecap="round"/>
          <circle cx="96" cy="120" r="10" fill="white"/>
          <circle cx="160" cy="120" r="10" fill="white"/>
        </svg>
      `);
      sharp(svg).resize(256, 256).png().toFile(iconPngPath);
      console.log('PNG icon created.\n');
    } else {
      console.log('sharp not available, skipping icon generation.\n');
    }
  } catch {
    console.log('Icon generation skipped.\n');
  }
}
if (!fs.existsSync(iconIcoPath)) {
  console.log('Note: No icon.ico found. electron-builder will use default icon.');
  console.log('For a custom icon, place an icon.ico file in the build/ folder.\n');
}

console.log('Step 1: Installing dependencies...');
try {
  execSync('npm install', { cwd: __dirname, stdio: 'inherit' });
  console.log('Dependencies OK.\n');
} catch (err) {
  console.error('npm install failed:', err.message);
  process.exit(1);
}

console.log('Step 2: Building Electron app...');
try {
  execSync('npx electron-builder --win --x64', { cwd: __dirname, stdio: 'inherit' });
  console.log('\n=== BUILD SUCCESSFUL! ===');
  console.log('Installer created in the "release" folder.');
  console.log('Install and run "Discord Bot Manager" from Start Menu or Desktop.');
} catch (err) {
  console.error('\nBuild failed:', err.message);
  console.log('\nTroubleshooting:');
  console.log('  1. Run: npm install');
  console.log('  2. Run: npx electron-builder --win --x64 --verbose');
  console.log('  3. Check antivirus is not blocking');
  console.log('  4. Make sure no spaces in project path');
  process.exit(1);
}
