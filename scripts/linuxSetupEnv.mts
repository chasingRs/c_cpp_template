import { exec } from 'child_process';
import 'zx/globals';
import { MSVCInstallDir } from './consts.mjs';
import { findVcvarsall } from "./setupMSVCDev.mjs"
import { refreshEnv } from './refreshenv.mts';

if (process.platform === 'win32') {
  console.error("This script is for Linux only,run 'windowsSetupEnv.mts' instead")
  process.exit(1)
}

class ConfigModifier {
  paltform: string
  constructor() {
    this.paltform = process.platform
  }
  modSystem = async function () {
    // await this.modLinux()
  }
  modConfig = async function () {
    await this.unixMod()
  }
  private unixMod = async function () {
    await this.modConan()
  }
  // For linux to use System package manager to install packages
  private modConan = async function () {
    const conanHome = `${process.env.HOME}/.conan2`
    await $`conan profile detect --force`.pipe(process.stderr)
    const content = fs.readFileSync(`${conanHome}/global.conf`, 'utf8')
    if (content.includes("tools.system.package_manager:mode")) {
      console.log(chalk.bold("conan global config already configured"))
      return
    } else {
      fs.appendFileSync(`${conanHome}/global.conf`, `
tools.system.package_manager:mode = install
tools.system.package_manager:sudo = True
tools.build:skip_test = True`)
    }
    console.log("=========conan global config=========")
    console.log(chalk.grey(fs.readFileSync(`${conanHome}/global.conf`, 'utf8')))
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
  _checkExists = async function (command: string) {
    if (await which(command, { nothrow: true })) {
      return true
    }
    return false
  }
  installToolchain = async function () {
    switch (this.packageManager) {
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
    if (this._checkExists('pyenv')) {
      console.log("pyenv already installed,installing python...")
    }
    else {
      await $`curl https://pyenv.run | bash`.pipe(process.stderr)
      await $`echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.bashrc && 
            echo 'command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.bashrc && 
            echo 'eval "$(pyenv init -)"' >> ~/.bashrc`.pipe(process.stderr)
      refreshEnv('source ~/.bashrc') //refresh environment, update PATH,etc
    }
    await $`pyenv install -s 3 && 
            pyenv global 3 &&
            curl -s https://bootstrap.pypa.io/get-pip.py | python`.pipe(process.stderr)
  }

  installConan = async function () {
    if (this._checkExists('conan')) {
      console.log("Conan already installed")
    } else {
      this._pipInstallPackage(['conan'])
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
