const fs = require('fs');
const path = require('path');

const distPath = path.resolve(__dirname, '..', 'dist');
const protectedFolders = [
  path.join(distPath, 'node'),
  path.join(distPath, 'node_modules')
];

removeDirectory(distPath);

fs.mkdirSync(distPath, { recursive: true });

function removeDirectory(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  fs.readdirSync(targetPath).forEach((entry) => {
    const entryPath = path.join(targetPath, entry);

    // Проверяем, является ли текущая папка защищённой
    if (protectedFolders.includes(entryPath)) {
      console.log(`Пропускаем защищённую папку: ${entryPath}`);
      return;
    }

    const stat = fs.lstatSync(entryPath);

    if (stat.isDirectory()) {
      removeDirectory(entryPath); // Рекурсивный вызов для подпапок
    } else {
      fs.unlinkSync(entryPath); // Удаляем файл
    }
  });

  // Удаляем папку только если она не в списке защищённых
  if (!protectedFolders.includes(targetPath)) {
    fs.rmdirSync(targetPath, { recursive: true });
  }
}
