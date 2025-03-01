/// This script sets up the environment for the project
/// It did the following things:
/// 1. install build essentials and package manager(we use conan here)
/// 2. configure conan's profile and global configuration

import { exec } from 'child_process';
import { usePowerShell } from 'zx';
import 'zx/globals';
import { MSVCInstallDir } from './consts.mjs';
import { findVcvarsall } from "./setupMSVCDev.mjs"

if (process.platform === 'win32') {
  usePowerShell()
}

if (process.platform != 'win32') {
  $.prefix = "set -eo pipefail;"
}

class ConfigModifier {
  paltform: string
  constructor() {
    this.paltform = process.platform
  }
  modSystem = async function () {
    if (this.paltform === 'linux') {
      // await this.modLinux()
    } else if (this.paltform === 'win32') {
      await this.modWindowsRegistry()
    } else {
      console.error("Unsupported platform")
      process.exit
    }
  }
  modConfig = async function () {
    if (this.paltform === 'linux') {
      await this.unixMod()
    } else if (this.paltform === 'win32') {
      await this.windowsMod()
    } else {
      console.error("Unsupported platform")
      process.exit
    }
  }
  private unixMod = async function () {
    await this.modConan()
  }
  private windowsMod = async function () {
    await this.modPowerShell()
  }
  // For linux to use System package manager to install packages
  private modConan = async function () {
    const conanHome = `${process.env.HOME}/.conan2`
    await $`source load_env.sh && conan profile detect --force`.pipe(process.stderr)
    const content = fs.readFileSync(`${conanHome}/global.conf`, 'utf8')
    if (content.includes("tools.system.package_manager:mode")) {
      console.log("conan global config already configured")
      return
    } else {
      fs.appendFileSync(`${conanHome}/global.conf`, `
tools.system.package_manager:mode = install
tools.system.package_manager:sudo = True
tools.build:skip_test = True`)
    }
    console.log("=========conan global config=========")
    console.log(fs.readFileSync(`${conanHome}/global.conf`, 'utf8'))
  }

  private modWindowsRegistry = async function () {
    // 定义要检查和修改的注册表项路径和值
    let registryPath = 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows Kits\\Installed Roots';
    let valueName = 'KitsRoot10';
    let valueType = 'REG_SZ'; // 可以是 REG_SZ, REG_DWORD, 等
    let valueData = MSVCInstallDir + '\\WindowsKits';

    let regAddCommand = `reg add "${registryPath}" /v "${valueName}" /t ${valueType} /d "${valueData}" /f`;
    exec(regAddCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`Stderr: ${stderr}`);
        return;
      }
      console.log(`Stdout: ${stdout}`);
    });

    // const components = [
    //   { name: 'SharedInstallationPath', path: MSVCInstallDir + '\\shared' },
    //   { name: 'VCInstallDir', path: MSVCInstallDir + '\\VC' },
    //   { name: 'SDKInstallDir', path: MSVCInstallDir + '\\SDK' },
    //   // Add more components as needed
    // ];
    //
    // registryPath = 'HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\Setup';
    // valueType = 'REG_SZ'; // Can be REG_SZ, REG_DWORD, etc.
    //
    // components.forEach(component => {
    //   const valueName = component.name;
    //   const valueData = component.path;
    //   const regAddCommand = `reg add "${registryPath}" /v "${valueName}" /t ${valueType} /d "${valueData}" /f`;
    //
    //   exec(regAddCommand, (error, stdout, stderr) => {
    //     if (error) {
    //       console.error(`Error: ${error.message}`);
    //       return;
    //     }
    //     if (stderr) {
    //       console.error(`Stderr: ${stderr}`);
    //       return;
    //     }
    //     console.log(`Stdout: ${stdout}`);
    //   });
    // });

  }
  // For windows to use PowerShell to invoke .bat script with environment variables saved
  private modPowerShell = async function () {
    const powerShellProfile = (await $`echo $PROFILE`).toString().trim()
    if (powerShellProfile) {
      if (!fs.existsSync(powerShellProfile)) {
        fs.createFileSync(powerShellProfile)
      }
      const content = await fs.readFile(powerShellProfile, 'utf8')
      if (content.includes("Invoke-Environment")) {
        console.log("PowerShell profile already configured")
        return
      }
      else {
        fs.appendFileSync(powerShellProfile, ` 
function Invoke-Environment {
    param
    (
        # Any cmd shell command, normally a configuration batch file.
        [Parameter(Mandatory=$true)]
        [string] $Command
    )
    $Command = "\`"" + $Command + "\`""
    cmd /c "$Command > nul 2>&1 && set" | . { process {
        if ($_ -match '^([^=]+)=(.*)') {
            [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2])
        }
    }}
}`)
      }
    }
  }
}

// class setupCpp {
//   async run() {
//     // WARN: Need to source ~/.cpprc # activate cpp environment variables
//     if (process.platform === 'win32') {
//       await $`npx setup-cpp --compiler msvc-2022 --vcvarsall true --cmake true --conan true --ninja true --ccache true`.pipe(process.stderr)
//     }
//     else if (process.platform === 'linux') {
//       await $`sudo npx setup-cpp --compiler gcc --cmake true --conan true --ninja true --ccache true`.pipe(process.stderr)
//     }
//   }
// }

class PackageManager {
  packageManager: string
  constructor() {
    this.packageManager = ''
  }
  installToolchain = async function () {
    switch (this.packageManager) {
      case 'choco':
        const pkgList = ['ninja', 'cmake', 'nsis']
        const pkgNeedInstall = pkgList.filter((pkg) => {
          const resolveOrNull = which.sync(pkg, { nothrow: true })
          if (resolveOrNull === null) {
            return true
          } else {
            console.log(`${pkg} already installed`)
            return false
          }
        })
        console.log("######## Installing packages: ", pkgNeedInstall, "#########")
        await this._chocoInstallPackage(pkgNeedInstall)
        // FIXME: Doesn't work
        // await this._chocoInstallPackageWithArgs('visualstudio2022buildtools', [`--package-parameters "--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --remove Microsoft.VisualStudio.Component.VC.CMake.Project --path install=${MSVCInstallDir}"`])

        // choco install -y visualstudio2022buildtools --package-parameters "--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --remove Microsoft.VisualStudio.Component.VC.CMake.Project --path install=C:\MSVC 2022\buildTools --path shared=C:\MSVC 2022\shared --path cache=C:\MSVC 2022\cache"

        // try {
        //   findVcvarsall('2022', undefined)
        //   console.info('MSVC 2022 already installed')
        // } catch {
        console.info('Installing MSVC 2022')
        const chocoInstallCommand = `choco install -y visualstudio2022buildtools --package-parameters "--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --remove Microsoft.VisualStudio.Component.VC.CMake.Project --path install=${MSVCInstallDir}\\buildTools --path shared=${MSVCInstallDir}\\shared --path cache=${MSVCInstallDir}\\cache"`
        await $`cmd /C ${chocoInstallCommand}`.pipe(process.stderr)
        // }
        break
      case 'apt':
        await this._aptInstallPackage(['build-essential', 'cmake', 'zlib1g-dev', 'libffi-dev', 'libssl-dev', 'libbz2-dev', 'libreadline-dev', 'libsqlite3-dev',
          'liblzma-dev', 'libncurses-dev', 'tk-dev'])
        break
      case 'pacman':
        await this._pacmanInstallPackage(['base-devel', 'cmake'])
        break
      case 'yum':
        await this._yumInstallPackage(['gcc-c++', 'cmake'])
        break
      case 'brew':
        await this._brewInstallPackage(['gcc', 'g++', 'cmake'])
        break
      default:
        console.error("Unknown package manager")
        process.exit(1)
    }
  }

  installConfigPy = async function () {
    if (process.platform === 'win32') {
      if (!await this.commandExists('python'))
        await this._chocoInstallPackage(['python'])
    }
    else {
      const home = process.env.HOME
      if (fs.existsSync(`${home}/.pyenv`)) {
        console.log("pyenv already installed")
        return
      }
      await $`curl https://pyenv.run | bash`.pipe(process.stderr)
      await $`echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.bashrc && 
            echo 'command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.bashrc && 
            echo 'eval "$(pyenv init -)"' >> ~/.bashrc`.pipe(process.stderr)
      await $`source load_env.sh &&
            pyenv install -s 3 && 
            pyenv global 3 &&
            curl -s https://bootstrap.pypa.io/get-pip.py | python`.pipe(process.stderr)
    }
  }

  installConan = async function () {
    if (process.platform === 'win32') {
      if (!this.commandExists('conan')) {
        await this._chocoInstallPackage(['conan'])
      }
    }
    else {
      await this._pipInstallPackage(['conan'])
    }
  }

  detectSystemPackageManager = async function () {
    if (process.platform === 'win32') {
      this.packageManager = 'choco'
    } else if (process.platform === 'linux') {
      try {
        await $`command -v apt-get`
        this.packageManager = "apt"
      } catch {
        try {
          await $`command -v yum`
          this.packageManager = "yum"
        } catch {
          try {
            await $`command -v pacman`
            this.packageManager = "pacman"
          } catch {
            console.error("Unknown package manager")
            process.exit(1)
          }
        }
      }
    } else if (process.platform === 'darwin') {
      this.packageManager = "brew"
    } else {
      console.error("Unknown platform")
      process.exit(1)
    }
  }

  _chocoInstallPackage = async function (packageList: string[]) {
    for (const pkg of packageList) {
      await $`choco install -y ${pkg}`.pipe(process.stderr)
    }
  }

  _chocoInstallPackageWithArgs = async function (pkg: string, args: string[]) {
    await $`choco install -y ${pkg} ${args}`.pipe(process.stderr)
  }

  _aptInstallPackage = async function (packageList: string[]) {
    await $`sudo apt-get update`.pipe(process.stderr)
    for (const pkg of packageList) {
      await $`sudo apt-get -y install ${pkg}`.pipe(process.stderr)
    }
  }
  _pacmanInstallPackage = async function (packageList: string[]) {
    await $`sudo pacman -Syyu`.pipe(process.stderr)
    for (const pkg of packageList) {
      await $`sudo pacman -S ${pkg}`.pipe(process.stderr)
    }
  }
  _yumInstallPackage = async function (packageList: string[]) {
    await $`sudo yum update`.pipe(process.stderr)
    for (const pkg of packageList) {
      await $`sudo yum install -y ${pkg}`.pipe(process.stderr)
    }
  }
  _brewInstallPackage = async function (packageList: string[]) {
    await $`brew update`.pipe(process.stderr)
    for (const pkg of packageList) {
      await $`brew install ${pkg}`.pipe(process.stderr)
    }
  }
  _pipInstallPackage = async function (packageList: string[]) {
    for (const pkg of packageList) {
      await $`source load_env.sh &&
            pip install ${pkg}`.pipe(process.stderr)
    }
  }
}

async function main() {
  const configModifier = new ConfigModifier()
  configModifier.modSystem()

  const packageManager = new PackageManager()
  await packageManager.detectSystemPackageManager()
  console.log(`Detected package manager: ${packageManager.packageManager}`)
  await packageManager.installToolchain()
  await packageManager.installConfigPy()
  await packageManager.installConan()

  await configModifier.modConfig()
}

main()
