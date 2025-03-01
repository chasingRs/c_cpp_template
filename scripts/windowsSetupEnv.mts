import { exec } from 'child_process';
import { usePowerShell } from 'zx';
import 'zx/globals';
import { MSVCInstallDir } from './consts.mjs';
import { findCmdsInEnv, refreshEnv } from './envHelper.mjs'

if (process.platform != 'win32') {
  console.error(chalk.red("This script is for Windows only,run 'linuxSetupEnv.mts' instead"))
}
usePowerShell()

class ConfigModifier {
  paltform: string
  constructor() {
    this.paltform = process.platform
  }
  modSystem = async function () {
    await this.modWindowsRegistry()
  }
  modConfig = async function () {
    await this.windowsMod()
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
    await $`conan profile detect --force`.pipe(process.stderr)
    const content = fs.readFileSync(`${conanHome}/global.conf`, 'utf8')
    if (content.includes("tools.build:skip_test")) {
      console.log(chalk.green("conan global config already configured"))
      return
    } else {
      fs.appendFileSync(`${conanHome}/global.conf`, `
tools.build:skip_test = True`)
    }
    console.log("=========conan global config=========")
    console.log(chalk.gray(fs.readFileSync(`${conanHome}/global.conf`, 'utf8')))
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
        console.log(chalk.green("PowerShell profile already configured"))
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

        const pkgNeedInstall = findCmdsInEnv(pkgList)
        console.log(chalk.blueBright("######## Installing packages: ", pkgNeedInstall, "#########"))
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
      default:
        console.error(chalk.red("Unknown package manager"))
        process.exit(1)
    }
  }

  installConfigPy = async function () {
    if (findCmdsInEnv(['pyenv']).length == 0) {
      console.log("pyenv already installed,installing python...")
    }
    else {
      await this._chocoInstallPackage(['pyenv-win'])
    }
    await $`pyenv install -s 3.10.5; 
            pyenv global 3.10.5`.pipe(process.stderr)
    // work or not ?
    // curl -s https://bootstrap.pypa.io/get-pip.py | python`.pipe(process.stderr)
    await $`powershell -Command "Invoke-WebRequest -Uri https://bootstrap.pypa.io/get-pip.py -OutFile ${os.tmpdir()}/get-pip.py && python ${os.tmpdir()}/get-pip.py"`.pipe(process.stderr)
  }

  installConan = async function () {
    if (findCmdsInEnv(['conan']).length == 0) {
      console.log(chalk.green("Conan already installed"))
    } else {
      await this._chocoInstallPackage(['conan'])
    }
  }

  detectSystemPackageManager = async function () {
    if (process.platform === 'win32') {
      if (findCmdsInEnv(['choco']).length == 0) {
        this.packageManager = 'choco'
      }
      else {
        console.error(chalk.red("platform is windows,but choco not found"))
        process.exit(1)
      }
    }
    else {
      console.error(chalk.red("Unknown platform"))
      process.exit(1)
    }
  }

  _chocoInstallPackage = async function (packageList: string[]) {
    for (const pkg of packageList) {
      await $`choco install -y ${pkg}`.pipe(process.stderr)
      refreshEnv('refreshenv') // call chooco's refreshenv to refresh environment variables
    }
  }

  _chocoInstallPackageWithArgs = async function (pkg: string, args: string[]) {
    await $`choco install -y ${pkg} ${args}`.pipe(process.stderr)
    refreshEnv('refreshenv') // call chooco's refreshenv to refresh environment variables
  }

  _pipInstallPackage = async function (packageList: string[]) {
    for (const pkg of packageList) {
      await $`pip install ${pkg}`.pipe(process.stderr)
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
