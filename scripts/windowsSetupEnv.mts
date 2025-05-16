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
  private readonly vsInstallerPath: string;
  private readonly vsWherePath: string;

  constructor(installDir: string) {
    this.customInstallDir = installDir;
    this.vsInstallerPath = `${process.env['ProgramFiles(x86)']}\\Microsoft Visual Studio\\Installer\\vs_installer.exe`;
    this.vsWherePath = `${process.env['ProgramFiles(x86)']}\\Microsoft Visual Studio\\Installer\\vswhere.exe`;
  }

  /**
   * 检测已安装的 MSVC 工具链
   */
  private async detectInstalledToolchains(): Promise<any[]> {
    try {
      const result = await $`& ${this.vsWherePath} -format json -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64`;
      return JSON.parse(result.stdout);
    } catch (error) {
      console.log(chalk.yellow('No MSVC toolchain detected:'), error.message);
      return [];
    }
  }

  /**
   * 修改现有安装的位置
   */
  private async modifyInstallationPath(instance: any): Promise<boolean> {
    try {
      console.log(chalk.yellow(`Modifying installation path from ${instance.installationPath} to ${this.customInstallDir}`));

      await $`& ${this.vsInstallerPath} modify --installPath "${instance.installationPath}" --path install=${this.customInstallDir} --quiet --norestart`;

      console.log(chalk.green('MSVC toolchain installation path modified successfully'));
      return true;
    } catch (error) {
      console.error(chalk.red('Failed to modify installation path:'), error);
      return false;
    }
  }

  /**
   * 移除已安装的工具链
   */
  async removePreinstalledToolchain(): Promise<boolean> {
    const instances = await this.detectInstalledToolchains();

    if (instances.length === 0) {
      return false;
    }

    try {
      console.log(chalk.yellow('Removing preinstalled MSVC toolchain...'));
      await $`& ${this.vsInstallerPath} modify --installPath "${instances[0].installationPath}" --remove Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --quiet --norestart`;
      console.log(chalk.green('Preinstalled MSVC toolchain removed successfully'));
      return true;
    } catch (error) {
      console.log(chalk.yellow('Removal failed:'), error.message);
      return false;
    }
  }

  /**
   * 安装或重新定位工具链
   */
  async installOrRelocateToolchain(): Promise<void> {
    const instances = await this.detectInstalledToolchains();

    // 如果已安装且位置正确
    if (instances.length > 0 && instances[0].installationPath.toLowerCase().startsWith(this.customInstallDir.toLowerCase())) {
      console.log(chalk.green('MSVC toolchain already installed at desired location'));
      return;
    }

    // 尝试修改现有安装位置
    if (instances.length > 0 && await this.modifyInstallationPath(instances[0])) {
      return;
    }

    // 如果修改失败或没有安装，则进行全新安装
    await this.installCustomToolchain();
  }

  /**
   * 全新安装工具链
   */
  private async installCustomToolchain(): Promise<void> {
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
    console.log(chalk.blueBright('Installing packages:', windowsPkgsToInstall.join(', ')));
    await this.chocoInstall(windowsPkgsToInstall);

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
    await toolchainManager.installOrRelocateToolchain();

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
