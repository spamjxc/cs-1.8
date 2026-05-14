const fs = require('fs');
const path = require('path');

const distPath = path.resolve(__dirname, '..', 'dist');

removeDirectory(distPath);

fs.mkdirSync(distPath, { recursive: true });

function removeDirectory(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  fs.readdirSync(targetPath).forEach((entry) => {
    const entryPath = path.join(targetPath, entry);
    const stat = fs.lstatSync(entryPath);

    if (stat.isDirectory()) {
      removeDirectory(entryPath);
    } else {
      fs.unlinkSync(entryPath);
    }
  });

  fs.rmdirSync(targetPath);
}
