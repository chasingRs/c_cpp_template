// TODO: Make MSVC toolchain install path configurable
import { usePowerShell } from 'zx';
import 'zx/globals';
import { MSVCInstallDir, windowsPkgsToInstall } from './consts.mjs';
import { refreshEnv } from './envHelper.mjs';
import { checkCmds } from './utils.mjs';

// Validate platform early
if (process.platform !== 'win32') {
  console.error(chalk.red("This script is for Windows only, run 'linuxSetupEnv.mts' instead"));
  process.exit(1);
}
usePowerShell();

class ConfigModifier {
  private readonly conanHome: string = `${os.homedir()}/.conan2`;
  private readonly conanGlobalConfigPath: string = `${this.conanHome}/global.conf`;

  async preInstallHook() {
    // TODO: Implement any pre-install configuration changes
  }

  async postInstallHook() {
    await this.configureConan();
  }

  private async configureConan() {
    try {
      await $`conan profile detect --force`.pipe(process.stderr);

      let content = '';
      if (fs.existsSync(this.conanGlobalConfigPath)) {
        content = fs.readFileSync(this.conanGlobalConfigPath, 'utf8');
      }

      if (content.includes('tools.build:skip_test')) {
        console.log(chalk.green('Conan global config already configured'));
        return;
      }

      const configToAppend = `
tools.build:skip_test = True
tools.microsoft.msbuild:installation_path=${MSVCInstallDir}\\buildTools
`.trim();

      fs.appendFileSync(this.conanGlobalConfigPath, configToAppend);

      console.log('========= Conan global config =========');
      console.log(chalk.gray(fs.readFileSync(this.conanGlobalConfigPath, 'utf8')));
    } catch (error) {
      console.error(chalk.red('Failed to configure Conan:'), error);
      throw error;
    }
  }
}

class MSVCToolchainManager {
  private readonly customInstallDir: string;
  private readonly vsInstallerPath: string = `${process.env['ProgramFiles(x86)']}\\Microsoft Visual Studio\\Installer\\vs_installer.exe`;

  constructor(installDir: string) {
    this.customInstallDir = installDir;
  }

  async removePreinstalledToolchain() {
    try {
      // 检测已安装的 MSVC 组件
      const instances = JSON.parse($`"${process.env['ProgramFiles(x86)']}\\Microsoft Visual Studio\\Installer\\vswhere.exe" -format json -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64`.toString());

      if (instances.length > 0) {
        console.log(chalk.yellow('Removing preinstalled MSVC toolchain...'));
        await $`"${this.vsInstallerPath}" modify --installPath "${instances[0].installationPath}" --remove Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --quiet --norestart`;
        console.log(chalk.green('Preinstalled MSVC toolchain removed successfully'));
      }
    } catch (error) {
      console.log(chalk.yellow('No preinstalled MSVC toolchain found or removal failed:'), error.message);
    }
  }

  async installCustomToolchain() {
    try {
      console.log(chalk.blue(`Installing MSVC toolchain to ${this.customInstallDir}`));

      const args = [
        '--package-parameters',
        `"--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --remove Microsoft.VisualStudio.Component.VC.CMake.Project --path install=${this.customInstallDir}"`
      ];

      await $`choco install -y visualstudio2022buildtools ${args}`.pipe(process.stderr);
      refreshEnv('refreshenv');

      console.log(chalk.green('MSVC toolchain installed successfully'));
    } catch (error) {
      console.error(chalk.red('MSVC toolchain installation failed:'), error);
      throw error;
    }
  }
}

class PackageManager {
  private packageManager: string = '';

  async detectSystemPackageManager() {
    if (checkCmds(['choco']).length == 0) {
      this.packageManager = 'choco';
    } else {
      console.error(chalk.red('Chocolatey not found in PATH'));
      process.exit(1);
    }
    console.log(`Detected package manager: ${this.packageManager}`);
  }

  async installPackages() {
    if (this.packageManager !== 'choco') {
      throw new Error('Unsupported package manager');
    }

    const missingPackages = checkCmds(windowsPkgsToInstall);
    if (missingPackages.length > 0) {
      console.log(chalk.blueBright('Installing packages:', missingPackages.join(', ')));
      await this.chocoInstall(missingPackages);
    }

    // // WARN: zx will escape the double quotes when passing args,
    // // See https://google.github.io/zx/quotes
    // const vsBuildToolsArgs = [
    //   '--package-parameters',
    //   `"--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.AddressSanitizer --includeRecommended --remove Microsoft.VisualStudio.Component.VC.CMake.Project --path install=${MSVCInstallDir}"`
    // ];
    //
    // // TODO: Check MSVC installation to decide whether to install or not
    // await this.chocoInstall(['visualstudio2022buildtools'], vsBuildToolsArgs);
  }

  private async chocoInstall(packages: string[], additionalArgs: string[] = []) {
    try {
      await $`choco install -y --ignore-reboot ${packages} ${additionalArgs}`.pipe(process.stderr);
      refreshEnv('refreshenv');
    } catch (error) {
      console.error(chalk.red(`Failed to install packages: ${packages.join(', ')}`), error);
      throw error;
    }
  }
}

async function main() {
  try {
    const configModifier = new ConfigModifier();
    const packageManager = new PackageManager();

    const toolchainManager = new MSVCToolchainManager(MSVCInstallDir);
    await toolchainManager.removePreinstalledToolchain();
    await toolchainManager.installCustomToolchain();

    await packageManager.detectSystemPackageManager();
    await configModifier.preInstallHook();
    await packageManager.installPackages();
    await configModifier.postInstallHook();

    console.log(chalk.green('Setup completed successfully!'));
  } catch (error) {
    console.error(chalk.red('Setup failed:'), error);
    process.exit(1);
  }
}

await main();
