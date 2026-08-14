@echo off
REM Encerra processos nas portas do Metro (8081/8082)
for %%P in (8081 8082) do (
  for /f "tokens=5" %%A in ('netstat -ano -q 2^>nul ^| findstr ":%%P "') do (
    if not "%%A"=="" (
      echo Encerrando porta %%P PID %%A
      taskkill /PID %%A /F
    )
  )
)

npx expo start -c --host lan
