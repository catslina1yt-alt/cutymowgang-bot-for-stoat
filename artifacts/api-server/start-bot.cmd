@echo off
if "%STOAT_BOT_TOKEN%"=="" (
  echo STOAT_BOT_TOKEN is required. Configure it as an environment variable.
  exit /b 1
)
if "%PORT%"=="" set PORT=8080
pnpm --filter @workspace/api-server run dev