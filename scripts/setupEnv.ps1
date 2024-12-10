# Install Chocolatey if not already installed
if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
    $Env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}


# Install Node.js using Chocolatey if not already installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    choco install -y nodejs-lts
  # Reload the PATH environment variable
  $Env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# Install tsx globally using npm if not already installed
if (-not (npm list -g tsx | Select-String 'tsx@')) {
    npm install -g tsx
}

npm install ..

# Install setup-cli globally using npm

tsx setupEnv.mts
