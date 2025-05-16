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
tools.microsoft.msbuild:installation_path=${MSVCInstallDir}
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

  private async checkInstallerAvailable(): Promise<boolean> {
    try {
      // 检查 vswhere 是否存在
      await fs.access(this.vsWherePath);
      return true
    } catch (error) {
      return false
    }
  }

  private async detectInstalledToolchains(): Promise<any[]> {
    try {
      const result = await $`& ${this.vsWherePath} -format json -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64`;
      return JSON.parse(result.stdout);
    } catch (error) {
      console.log(chalk.yellow('No MSVC toolchain detected:'), error.message);
      return [];
    }
  }

  async removePreinstalledToolchain(): Promise<boolean> {
    const instances = await this.detectInstalledToolchains();
    console.log(instances[0].installationPath)

    if (instances.length === 0) {
      return false;
    }

    try {
      console.log(chalk.yellow('Removing preinstalled MSVC toolchain...'));

      await $`${this.installCleanupPath}`.pipe(process.stderr);

      console.log(chalk.green('Preinstalled MSVC toolchain removed successfully'));
      return true;
    } catch (error) {
      console.log(chalk.yellow('Removal failed:'), error.message);
      return false;
    }
  }

  async installOrRelocateToolchain(): Promise<void> {
    if (await this.checkInstallerAvailable()) {
      const instances = await this.detectInstalledToolchains();

      // installed and in the desired location
      if (instances.length > 0 && instances[0].installationPath.toLowerCase().startsWith(this.customInstallDir.toLowerCase())) {
        console.log(chalk.green('MSVC toolchain already installed at desired location'));
        return;
      }

      // installed but not in the desired location
      if (instances.length > 0) {
        if (!await this.removePreinstalledToolchain()) {
          throw new Error('Failed to remove existing installation');
        }
        console.log(chalk.yellow('Relocating MSVC toolchain...'));
        await this.installWithVsInstaller();
      }
    } else {
      // install it with choco
      const args = [
        '--package-parameters',
        `"--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --remove Microsoft.VisualStudio.Component.VC.CMake.Project --path install=${this.customInstallDir}"`
      ];
      await $`choco install -y visualstudio2022buildtools ${args}`.pipe(process.stderr);
    }
  }

  private async installWithVsInstaller(): Promise<void> {
    try {
      console.log(chalk.blue(`Installing MSVC toolchain to ${this.customInstallDir} using VS Installer`));

      await $`& ${this.vsInstallerPath} install --channelId "VisualStudio.17.Release" --productId "Microsoft.VisualStudio.Product.BuildTools" --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.AddressSanitizer --includeRecommended --remove Microsoft.VisualStudio.Component.VC.CMake.Project --passive --norestart --path install=${this.customInstallDir}`;

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
