@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo Исправление путей в .git...


:: Проверяем, что находимся в корне репозитория
if not exist ".git\HEAD" (
    echo Ошибка: папка .git не найдена!
    exit /b 1
)

:: Исправляем core.worktree
"%~dp0git\PortableGit_2.46.2\bin\git.exe" config --unset core.worktree
"%~dp0git\PortableGit_2.46.2\bin\git.exe" config core.worktree ..

:: Убеждаемся, что репозиторий не "голый"
"%~dp0git\PortableGit_2.46.2\bin\git.exe" config core.bare false


:: Проверяем файл HEAD на абсолютные пути (редко, но бывает)
set "head_file=.git\HEAD"
if exist "%head_file%" (
    powershell -Command "(Get-Content '%head_file%') | ForEach-Object { $_ -replace '^[A-Z]:', '%CD:~0,2%:' } | Set-Content '%head_file%'"
)

echo Проверка целостности репозитория...
"%~dp0git\PortableGit_2.46.2\bin\git.exe" fsck --full


echo.
echo Готово! Попробуйте выполнить 'git status'
