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
  private vsInstallerPath: string;
  private vsWherePath: string;
  private installCleanupPath: string;

  constructor(installDir: string) {
    this.customInstallDir = installDir;
    this.initializePaths();
  }

  private initializePaths() {
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    this.vsInstallerPath = `${programFilesX86}\\Microsoft Visual Studio\\Installer\\vs_installer.exe`;
    this.vsWherePath = `${programFilesX86}\\Microsoft Visual Studio\\Installer\\vswhere.exe`;
    this.installCleanupPath = `${programFilesX86}\\Microsoft Visual Studio\\Installer\\installCleanup.exe`;
  }

  /**
   * 检查并安装 Visual Studio Installer（仅在缺失时）
   */
  private async ensureInstallerAvailable(): Promise<void> {
    try {
      // 检查 vswhere 是否存在
      await fs.access(this.vsWherePath);
    } catch (error) {
      console.log(chalk.yellow('Visual Studio Installer not found, installing via Chocolatey...'));
      try {
        await $`choco install -y visualstudio-installer --no-progress`;
        this.initializePaths(); // 重新初始化路径
        console.log(chalk.green('Visual Studio Installer installed successfully'));
      } catch (chocoError) {
        console.error(chalk.red('Failed to install Visual Studio Installer:'), chocoError);
        throw new Error('Visual Studio Installer installation failed');
      }
    }
  }

  /**
   * 检测已安装的 MSVC 工具链
   */
  private async detectInstalledToolchains(): Promise<any[]> {
    await this.ensureInstallerAvailable();

    try {
      const result = await $`& ${this.vsWherePath} -format json -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64`;
      return JSON.parse(result.stdout);
    } catch (error) {
      console.log(chalk.yellow('No MSVC toolchain detected:'), error.message);
      return [];
    }
  }

  /**
   * 完全卸载 Visual Studio 实例
   */
  private async completelyUninstallVisualStudio(): Promise<boolean> {
    try {
      console.log(chalk.yellow('Completely uninstalling Visual Studio...'));

      // 使用 VS Installer 完全卸载
      await $`& ${this.installCleanupPath}`;
      console.log(chalk.green('Visual Studio completely uninstalled'));
      return true;
    } catch (error) {
      console.error(chalk.red('Failed to completely uninstall Visual Studio:'), error);
      return false;
    }
  }

  /**
   * 使用 Chocolatey 安装 Visual Studio Build Tools
   */
  private async installWithChocolatey(): Promise<void> {
    try {
      console.log(chalk.blue(`Installing MSVC toolchain to ${this.customInstallDir} using Chocolatey`));

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

  /**
   * 安装或重新定位工具链
   */
  async installOrRelocateToolchain(): Promise<void> {
    await this.ensureInstallerAvailable();
    const instances = await this.detectInstalledToolchains();

    // 如果已安装且位置正确
    if (instances.length > 0 && instances[0].installationPath.toLowerCase().startsWith(this.customInstallDir.toLowerCase())) {
      console.log(chalk.green('MSVC toolchain already installed at desired location'));
      return;
    }

    // 如果已安装但位置不正确，则完全卸载
    if (instances.length > 0) {
      if (!await this.completelyUninstallVisualStudio()) {
        throw new Error('Failed to remove existing installation');
      }
    }

    // 使用 Chocolatey 全新安装到指定位置
    await this.installWithChocolatey();
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
