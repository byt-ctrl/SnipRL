@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if /i "%~1"=="check" goto :check
if /i "%~1"=="install" goto :install
goto :run

:check
where node >nul 2>nul || (echo FAIL: Node.js not found & exit /b 1)
where pnpm >nul 2>nul || (echo FAIL: pnpm not found & exit /b 1)
node --version
call pnpm --version
echo OK: toolchain check passed
exit /b 0

:install
where pnpm >nul 2>nul || (echo pnpm missing, installing... & npm install -g pnpm@9.12.0 || exit /b 1)
if not exist "node_modules" (echo Installing workspace deps... & call pnpm install || exit /b 1) else (echo Deps already installed, skipping.)
if not exist "apps\api\.env" (
  if exist "apps\api\.env.example" (echo Creating apps\api\.env from example... & copy /y "apps\api\.env.example" "apps\api\.env" >nul)
)
if not exist "packages\shared\dist\index.js" (echo Building @sniprl/shared... & call pnpm --filter @sniprl/shared build || exit /b 1)
echo Attempting DB migrate (non-fatal without local Postgres role)...
call pnpm db:migrate || echo WARN: migrate failed - fix DATABASE_URL role, then re-run.
exit /b 0

:run
where node >nul 2>nul || (echo FAIL: Node.js not found. Install Node 20+ first. & exit /b 1)
where pnpm >nul 2>nul || (echo pnpm missing, installing... & npm install -g pnpm@9.12.0 || exit /b 1)
if not exist "node_modules" (echo First run - installing deps... & call pnpm install || exit /b 1)
if not exist "apps\api\.env" (
  if exist "apps\api\.env.example" (echo Creating apps\api\.env from example... & copy /y "apps\api\.env.example" "apps\api\.env" >nul)
)
if not exist "packages\shared\dist\index.js" (echo Building @sniprl/shared... & call pnpm --filter @sniprl/shared build || exit /b 1)

echo Launching SnipRL API :3000 and Web :5173 in separate windows...
start "SnipRL API :3000" cmd /k "cd /d ""%CD%"" && call pnpm --filter @sniprl/api dev"
start "SnipRL Web :5173" cmd /k "cd /d ""%CD%"" && call pnpm --filter @sniprl/web dev"

echo Waiting for servers to boot, then opening browser...
timeout /t 8 /nobreak >nul
start "" "http://localhost:5173"
start "" "http://localhost:3000/health"
echo.
echo OK: Both servers launched in their own windows. This window exits now.
exit /b 0
