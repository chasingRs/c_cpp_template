import 'zx/globals';
import { findCmdsInEnv, refreshEnv } from './envHelper.mts';

if (process.platform !== 'linux') {
  console.error("This script is for Linux only,run 'windowsSetupEnv.mts' instead")
  process.exit(1)
}

class ConfigModifier {
  paltform: string
  constructor() {
    this.paltform = process.platform
  }
  preInstallMod = async function () {
    // TODO: Change some configs before installing packages
  }
  postInstallMod = async function () {
    await this.modConan()
  }
  private modConan = async function () {
    const conanHome = `${os.homedir()}/.conan2`
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
  installToolchain = async function () {
    switch (this.packageManager) {
      case 'apt':
        await this._aptInstallPackage(['build-essential', 'cmake', 'ninja-build', 'ccache', 'cppcheck', 'gcovr', 'zlib1g-dev', 'libffi-dev', 'libssl-dev', 'libbz2-dev', 'libreadline-dev', 'libsqlite3-dev',
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
    if (findCmdsInEnv(['pyenv']).length == 0 || fs.existsSync(`${os.homedir()}/.pyenv`)) {
      console.log("pyenv already installed,installing python...")
    }
    else {
      await $`curl https://pyenv.run | bash`.pipe(process.stderr)
      await $`echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.profile && 
            echo 'command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.profile && 
            echo 'eval "$(pyenv init -)"' >> ~/.profile`.pipe(process.stderr)
    }
    refreshEnv('source ~/.profile') //refresh environment, update PATH,etc
    await $`pyenv install -s 3.10.5 && 
            pyenv global 3.10.5`.pipe(process.stderr)
    if (findCmdsInEnv(['pip']).length > 0) {
      await $`python -m ensurepip --upgrade`.pipe(process.stderr)
    }
  }

  installConan = async function () {
    if (findCmdsInEnv(['conan']).length == 0) {
      console.log(chalk.greenBright("Conan already installed"))
    } else {
      console.log(chalk.blueBright("Installing Conan..."))
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
      await $`pip install ${pkg}`.pipe(process.stderr)
    }
  }
}

async function main() {
  const configModifier = new ConfigModifier()
  configModifier.preInstallMod()
  const packageManager = new PackageManager()
  await packageManager.detectSystemPackageManager()
  console.log(chalk.blue(`Detected package manager: ${packageManager.packageManager}`))
  await packageManager.installToolchain()
  await packageManager.installConfigPy()
  await packageManager.installConan()
  await configModifier.postInstallMod()
}

main()
