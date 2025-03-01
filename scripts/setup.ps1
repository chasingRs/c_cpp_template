if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
    $Env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    choco install -y nodejs-lts
  # Reload the PATH environment variable
  $Env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

npm install -g tsx

npm install ..

tsx windowsSetupEnv.mts
