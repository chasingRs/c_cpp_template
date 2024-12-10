@echo off
powershell -Command "Set-ExecutionPolicy RemoteSigned -Scope CurrentUser"
powershell -File "setupEnv.ps1"
