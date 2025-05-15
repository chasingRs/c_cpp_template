import 'zx/globals';
import { refreshEnv } from './envHelper.mts';
import { checkCmds } from './utils.mts';
import { linuxPkgsToInstall } from './consts.mts';

if (process.platform !== 'linux') {
  console.error("This script is for Linux only, run 'windowsSetupEnv.mts' instead")
  process.exit(1)
}

class ConfigModifier {
  paltform: string
  constructor() {
    this.paltform = process.platform
  }
  async preInstallHook() {
    // TODO: Change some configs before installing packages
  }
  async postInstallHook() {
    await this.modConan()
  }
  private async modConan() {
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
  async installToolchain() {
    switch (this.packageManager) {
      case 'apt':
        await this.aptInstallPackage(linuxPkgsToInstall['apt'])
        break
      // TODO: Need to add package names for other package managers below
      case 'pacman':
        await this.pacmanInstallPackage(linuxPkgsToInstall['pacman'])
        break
      case 'yum':
        await this.yumInstallPackage(linuxPkgsToInstall['yum'])
        break
      case 'brew':
        await this.brewInstallPackage(linuxPkgsToInstall['brew'])
        break
      default:
        console.error("Unknown package manager")
        process.exit(1)
    }
  }

  async installConfigPy() {
    if (checkCmds(['pyenv']).length == 0 || fs.existsSync(`${os.homedir()}/.pyenv`)) {
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
    if (checkCmds(['pip']).length > 0) {
      await $`python -m ensurepip --upgrade`.pipe(process.stderr)
    }
  }

  async installConan() {
    if (checkCmds(['conan']).length == 0) {
      console.log(chalk.greenBright("Conan already installed"))
    } else {
      console.log(chalk.blueBright("Installing Conan..."))
      await this.pipInstallPackage(['conan'])
    }
  }

  async detectSystemPackageManager() {
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

  private async aptInstallPackage(packageList: string[]) {
    await $`sudo apt-get update`.pipe(process.stderr)
    for (const pkg of packageList) {
      await $`sudo apt-get -y install ${pkg}`.pipe(process.stderr)
    }
  }
  private async pacmanInstallPackage(packageList: string[]) {
    await $`sudo pacman -Syyu`.pipe(process.stderr)
    for (const pkg of packageList) {
      await $`sudo pacman -S ${pkg}`.pipe(process.stderr)
    }
  }
  private async yumInstallPackage(packageList: string[]) {
    await $`sudo yum update`.pipe(process.stderr)
    for (const pkg of packageList) {
      await $`sudo yum install -y ${pkg}`.pipe(process.stderr)
    }
  }
  private async brewInstallPackage(packageList: string[]) {
    await $`brew update`.pipe(process.stderr)
    for (const pkg of packageList) {
      await $`brew install ${pkg}`.pipe(process.stderr)
    }
  }
  private async pipInstallPackage(packageList: string[]) {
    for (const pkg of packageList) {
      await $`pip install ${pkg}`.pipe(process.stderr)
    }
  }
}

async function main() {
  const configModifier = new ConfigModifier()
  const packageManager = new PackageManager()
  await packageManager.detectSystemPackageManager()
  console.log(chalk.blue(`Detected package manager: ${packageManager.packageManager}`))
  configModifier.preInstallHook()
  await packageManager.installToolchain()
  await packageManager.installConfigPy()
  await packageManager.installConan()
  await configModifier.postInstallHook()
}

await main()
