Set-Location C:\treinamento\iFujao\StudyFlow\android
.\gradlew.bat --stop
Remove-Item -Recurse -Force app\build -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ..\.expo -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ..\node_modules\.cache -ErrorAction SilentlyContinue
.\gradlew.bat assembleRelease --no-daemon
Set-Location ..
