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

  async preInstallHook() {
    // TODO: Implement any pre-install configuration changes
  }

  async postInstallHook() {
    await this.configureConan();
  }

  private async configureConan() {
    try {
      // 1. 检测并生成默认 profile
      await $`conan profile detect --force`.pipe(process.stderr);

      // 2. 获取默认 profile 路径 (通常是 ~/.conan2/profiles/default)
      const conanHome = `${os.homedir()}/.conan2`;
      const defaultProfilePath = `${conanHome}/profiles/default`;

      // 3. 读取并修改 profile 内容
      let content: string = fs.readFileSync(defaultProfilePath, 'utf8');
      const lines = content.split('\n');
      const newLines = lines.map(line => {
        if (line.trim().startsWith('compiler.cppstd=')) {
          return 'compiler.cppstd=20';
        }
        return line;
      });

      fs.writeFileSync(defaultProfilePath, newLines.join('\n'));

      // 5. 配置 global.conf
      const globalConfPath = `${conanHome}/global.conf`;
      let globalConf = '';

      if (fs.existsSync(globalConfPath)) {
        globalConf = fs.readFileSync(globalConfPath, 'utf8');
      }

      if (!globalConf.includes("tools.build:skip_test")) {
        const configToAppend = `
tools.build:skip_test = True
tools.microsoft.msbuild:installation_path=${MSVCInstallDir}\\buildTools
`.trim();
        fs.appendFileSync(globalConfPath, configToAppend);
      }

      console.log("========= Modified Conan default profile =========");
      console.log(chalk.gray(fs.readFileSync(defaultProfilePath, 'utf8')));

      console.log("========= Conan global config =========");
      console.log(chalk.gray(fs.readFileSync(globalConfPath, 'utf8')));
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

  constructor(installDir: string) {
    this.customInstallDir = installDir;
    this.initializePaths();
  }

  private initializePaths() {
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    this.vsInstallerPath = `${programFilesX86}\\Microsoft Visual Studio\\Installer\\vs_installer.exe`;
    this.vsWherePath = `${programFilesX86}\\Microsoft Visual Studio\\Installer\\vswhere.exe`;
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
   * 移除已安装的工具链
   */
  async removePreinstalledToolchain(): Promise<boolean> {
    const instances = await this.detectInstalledToolchains();

    if (instances.length === 0) {
      return false;
    }

    try {
      console.log(chalk.yellow('Removing preinstalled MSVC toolchain...'));

      await $`& ${this.vsInstallerPath} modify --installPath "${instances[0].installationPath}" `
        + `--remove Microsoft.VisualStudio.Workload.VCTools `
        + `--remove Microsoft.Component.MSBuild `
        + `--remove Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
        + `--remove Microsoft.VisualStudio.Component.VC.CMake.Project `
        + `--quiet --norestart`;

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
    await this.ensureInstallerAvailable();
    const instances = await this.detectInstalledToolchains();

    // 如果已安装且位置正确
    if (instances.length > 0 && instances[0].installationPath.toLowerCase().startsWith(this.customInstallDir.toLowerCase())) {
      console.log(chalk.green('MSVC toolchain already installed at desired location'));
      return;
    }

    // 如果已安装但位置不正确
    if (instances.length > 0) {
      if (!await this.removePreinstalledToolchain()) {
        throw new Error('Failed to remove existing installation');
      }
    }

    // 全新安装
    await this.installWithVsInstaller();
  }

  /**
   * 使用 VS Installer 安装工具链
   */
  private async installWithVsInstaller(): Promise<void> {
    try {
      console.log(chalk.blue(`Installing MSVC toolchain to ${this.customInstallDir} using VS Installer`));

      await $`& ${this.vsInstallerPath} modify --installPath "${this.customInstallDir}" `
        + `--add Microsoft.VisualStudio.Workload.VCTools `
        + `--includeRecommended `
        + `--remove Microsoft.VisualStudio.Component.VC.CMake.Project `
        + `--passive --wait --norestart`;

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

    // const toolchainManager = new MSVCToolchainManager(MSVCInstallDir);
    // await toolchainManager.installOrRelocateToolchain();

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
