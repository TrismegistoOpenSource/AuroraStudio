// Slim each packaged app: keep only the sharp native binaries that match the
// app's architecture (Apple Silicon vs Intel), removing the other arch.
const fs = require('fs');
const path = require('path');

// builder-util Arch enum: ia32=0, x64=1, armv7l=2, arm64=3, universal=4
exports.default = async function afterPack(context) {
  const { appOutDir, packager, arch } = context;
  const archName = arch === 3 ? 'arm64' : arch === 1 ? 'x64' : null;
  if (!archName) return; // skip universal / others
  const other = archName === 'arm64' ? 'x64' : 'arm64';

  const appName = packager.appInfo.productFilename; // "Aurora Studio"
  const imgDir = path.join(
    appOutDir, `${appName}.app`, 'Contents', 'Resources',
    'app.asar.unpacked', 'node_modules', '@img'
  );

  for (const pkg of [`sharp-darwin-${other}`, `sharp-libvips-darwin-${other}`]) {
    const p = path.join(imgDir, pkg);
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
      console.log(`  • afterPack: rimosso ${pkg} dalla build ${archName}`);
    }
  }
};
