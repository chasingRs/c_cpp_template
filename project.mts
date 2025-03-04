import { throws } from 'assert'
import { PathOrFileDescriptor } from 'fs-extra'
import { usePowerShell } from 'zx'
import 'zx/globals'
import { MSVCInstallDir } from './scripts/consts.mjs'
import { findCmdsInEnv, refreshEnv } from './scripts/envHelper.mts'
import { setupMSVCDevCmd } from './scripts/setupMSVCDev.mts'


const cachePath = '.project_cache.json'
const presetsFilePath = 'CMakePresets.json'
let script_postfix = ''

if (process.platform === 'win32') {
  usePowerShell()
  script_postfix = 'bat'
}

if (process.platform === 'linux') {
  script_postfix = 'sh'
}

function parseJson(json: PathOrFileDescriptor) {
  try {
    let content = fs.readFileSync(json, 'utf8')
    return JSON.parse(content)
  } catch (e) {
    console.error(chalk.redBright('error:', e))
    throws(e)
  }
}

// TODO: Add cmake option support
interface CmakeOptions {
  packagingMaintainerMode: boolean,
  warningsAsErrors: boolean,
  enableClangTidy: boolean,
  enableCppCheck: boolean,
  enableSanitizerLeak: boolean,
  enableSanitizerUndefined: boolean,
  enableSanitizerThread: boolean,
  enableSanitizerMemory: boolean,
  enableSanitizerAddress: boolean,
  enableUnityBuild: boolean,
  enablePch: boolean,
  enableCache: boolean,
  enableIpo: boolean,
  enableUserLinker: boolean,
  enableCoverage: boolean,
  buildFuzzTests: boolean,
  enableHardening: boolean,
  enableGlobalHardening: boolean,
  gitSha: string,
}

interface PresetContext {
  presetsFilePath: PathOrFileDescriptor,
  selectedPreset: string,
}

enum TargetType {
  Build,
  Launch,
  Test,
}

interface TargetContext {
  target: string
  args: string
}

interface SetupContext {
  preset: PresetContext
}

class CmakeOptionManager {
  option: CmakeOptions
  constructor(cachePath: PathOrFileDescriptor) {
    this.option = parseJson(cachePath).cmakeOptions
  }
}

class ProjectManager {
  cachePath: PathOrFileDescriptor
  // decided by the preset
  preset: string
  sourceDir: string
  binaryDir: string
  installDir: string
  buildType: string
  // decided by the user
  buildTarget: string
  launchTarget: string
  launchArgs: string
  testArgs: string

  setTargetContext(type: TargetType, context: TargetContext) {
    switch (type) {
      case TargetType.Build:
        this.buildTarget = context.target
        break
      case TargetType.Launch:
        this.launchTarget = context.target
        this.launchArgs = context.args
        break
      case TargetType.Test:
        this.testArgs = context.args
        break
    }
    this.save2File()
  }

  constructor(setup?: SetupContext) {
    this.cachePath = cachePath
    if (setup) {
      this.setup(setup.preset)
    }
    else
      try {
        const parsedCache = this.fromJson(this.cachePath)
        this.preset = parsedCache.preset
        this.sourceDir = parsedCache.sourceDir
        this.binaryDir = parsedCache.binaryDir
        this.installDir = parsedCache.installDir
        this.buildType = parsedCache.buildType
        this.buildTarget = parsedCache.buildTarget
        this.launchTarget = parsedCache.launchTarget
        this.launchArgs = parsedCache.launchArgs
        this.testArgs = parsedCache.testArgs
      } catch (e) {
        console.error(`Unable to parse config from json file:${{ e }}, possibly forgot to run setup first?`)
      }
  }

  // NOTE: Change follow to set a default value for each config
  private setup = function (preset: PresetContext) {
    const presets = parseJson(preset.presetsFilePath)
    // these variables is used by 'eval' command bellow
    const sourceDir = process.cwd()
    const presetName = preset.selectedPreset
    this.preset = preset.selectedPreset
    this.sourceDir = process.cwd()
    try {
      this.binaryDir = presets.configurePresets[0].binaryDir.replace(/\$\{(.*?)\}/g, (_, p1) => eval(p1))
      this.installDir = presets.configurePresets[0].installDir.replace(/\$\{(.*?)\}/g, (_, p1) => eval(p1))
      this.buildType = presets.configurePresets.find(item => item.name == preset.selectedPreset).cacheVariables.CMAKE_BUILD_TYPE
    } catch (e) {
      console.error(chalk.redBright('Error: Failed to parser cmake presets, please check the exists of this preset'))
      process.exit(1)
    }
    this.buildTarget = 'all'
    this.launchTarget = ''
    this.launchArgs = ''
    this.testArgs = ''
    this.save2File()
  }

  private save2File = function () {
    let cache2Save = {
      preset: this.preset,
      sourceDir: this.sourceDir,
      binaryDir: this.binaryDir,
      installDir: this.installDir,
      buildType: this.buildType,
      buildTarget: this.buildTarget,
      launchTarget: this.launchTarget,
      launchArgs: this.launchArgs,
      testArgs: this.testArgs
    }
    fs.writeFileSync(this.cachePath, JSON.stringify(cache2Save, null, 2))
  }

  private fromJson(filePath: PathOrFileDescriptor) {
    return parseJson(filePath)
  }
}

class Excutor {
  projectManager: ProjectManager

  constructor(projectManager: ProjectManager) {
    this.projectManager = projectManager
  }

  private refreshEnvFromScript = function (script: string) {
    if (process.platform === 'win32') {
      refreshEnv(script)
    }
    else if (process.platform === 'linux') {
      refreshEnv(`source ${script}`)
    }
  }

  clean = async function () {
    if (fs.existsSync(this.projectManager.binaryDir)) {
      await fs.remove(this.projectManager.binaryDir)
    }
  }

  cmakeConfigure = async function () {
    if (this.projectManager.preset.includes('msvc')) {
      setupMSVCDevCmd(
        "x64",
        MSVCInstallDir,
        undefined,
        undefined,
        false,
        false,
        undefined
      );
      const cmakeConfigreCommand = `"cmake -S . --preset=${this.projectManager.preset}"`
      await $`powershell -Command ${cmakeConfigreCommand}`.pipe(process.stderr)
      const newItemCommand = `"New-Item -ItemType SymbolicLink -Path ${this.projectManager.sourceDir}/compile_commands.json -Target ${this.projectManager.binaryDir}/compile_commands.json"`
      await $`powershell -Command ${newItemCommand}`.pipe(process.stderr)
    } else {
      await $`cmake -S . --preset=${this.projectManager.preset}`.pipe(process.stderr)
      await $`ln -sfr ${this.projectManager.binaryDir}/compile_commands.json ${this.projectManager.sourceDir}/compile_commands.json `.pipe(process.stderr)
    }
  }

  cmakeBuild = async function () {
    this.refreshEnvFromScript(`${this.projectManager.binaryDir}/conan/build/${this.projectManager.buildType}/generators/conanbuild.${script_postfix}`)
    this.refreshEnvFromScript(`${this.projectManager.binaryDir}/conan/build/${this.projectManager.buildType}/generators/conanrun.${script_postfix}`)
    if (this.projectManager.preset.includes('msvc')) {
      setupMSVCDevCmd(
        "x64",
        MSVCInstallDir,
        undefined,
        undefined,
        false,
        false,
        undefined
      );
      const cmakeBuildCommand = `"cmake --build ${this.projectManager.binaryDir} --target ${this.projectManager.buildTarget}"`
      await $`powershell -Command ${cmakeBuildCommand}`.pipe(process.stderr)
    } else {
      await $`cmake --build ${this.projectManager.binaryDir} --target ${this.projectManager.buildTarget} `.pipe(process.stderr)
    }
  }

  runTarget = async function () {
    this.projectManager.buildTarget = this.projectManager.launchTarget
    await this.cmakeBuild()
    this.refreshEnvFromScript(`${this.projectManager.binaryDir}/conan/build/${this.projectManager.buildType}/generators/conanrun.${script_postfix}`)
    if (process.platform === 'win32') {
      const runTargetCommand = `"${this.projectManager.binaryDir}/bin/${this.projectManager.launchTarget}.exe ${this.projectManager.launchArgs}"`
      await $({ stdio: ['inherit', 'pipe', 'pipe'] })`powershell -Command ${runTargetCommand}`.pipe(process.stderr)
    } else {
      await $({ stdio: ['inherit', 'pipe', 'pipe'] })`${this.projectManager.binaryDir}/bin/${this.projectManager.launchTarget} ${this.projectManager.launchArgs}`.pipe(process.stderr)
    }
  }

  runTest = async function () {
    await this.cmakeBuild()
    this.refreshEnvFromScript(`${this.projectManager.binaryDir}/conan/build/${this.projectManager.buildType}/generators/conanrun.${script_postfix}`)
    if (process.platform === 'win32') {
      const runTestCommand = `"ctest ${this.projectManager.testArgs}"`
      await $`powershell -Command ${runTestCommand}`.pipe(process.stderr)
    } else {
      await $`ctest --preset ${this.projectManager.preset} ${this.projectManager.testArgs}`.pipe(process.stderr)
    }
  }

  runCov = async function () {
    await this.cmakeBuild()
    this.refreshEnvFromScript(`${this.projectManager.binaryDir}/conan/build/${this.projectManager.buildType}/generators/conanrun.${script_postfix}`)
    if (process.platform === 'win32') {
      const runTestCommand = `"OpenCppCoverage.exe --working_dir ${this.projectManager.binaryDir} --export_type cobertura:coverage.xml --cover_children -- ctest ${this.projectManager.testArgs}"`
      await $`powershell -Command ${runTestCommand}`.pipe(process.stderr)
    } else {
      await $`ctest --preset ${this.projectManager.preset} ${this.projectManager.testArgs}`.pipe(process.stderr)
      await $`gcovr --delete --root . --print-summary --xml-pretty --xml ${this.projectManager.binaryDir}/coverage.xml . --gcov-executable gcov`.pipe(process.stderr)
    }
  }

  install = async function () {
    await this.cmakeBuild()
    if (process.platform === 'win32') {
      const cpackCommand = `"cmake --install ${this.projectManager.binaryDir}"`
      await $`powershell -Command ${cpackCommand}`.pipe(process.stderr)
    } else {
      await $`cmake --install ${this.projectManager.binaryDir}`.pipe(process.stderr)
    }
  }

  cpack = async function () {
    await this.cmakeBuild()
    if (process.platform === 'win32') {
      const cpackCommand = `"cd ${this.projectManager.binaryDir};cpack"`
      await $`powershell -Command ${cpackCommand}`.pipe(process.stderr)
    } else {
      await $`cd ${this.projectManager.binaryDir} && cpack`.pipe(process.stderr)
    }
  }
}

function showHelp() {
  console.log(chalk.green(' This script is used to run target flexible'))
  console.log(chalk.green(' usage: project.mjs <action> [target] [-- args]'))
  console.log(chalk.green(' for example:\n'))
  console.log(chalk.green(' Geting help'))
  console.log(chalk.green(' tsx project.mts                                     ---show help'))
  console.log(chalk.green(' tsx project.mts -h                                  ---show help'))
  console.log(chalk.green(' tsx project.mts --help                              ---show help'))
  console.log("\n")
  console.log(chalk.green(' Setup the project(select a cmake preset, parse and store it)'))
  console.log(chalk.green(' tsx project.mts setup  some_preset                  ---setup the project with specified preset'))
  console.log("\n")
  console.log(chalk.green(' Clean the project'))
  console.log(chalk.green(' tsx project.mts clean                               ---clean project'))
  console.log("\n")
  console.log(chalk.green(' Cmake configure'))
  console.log(chalk.green(' tsx project.mts config                              ---run cmake configure'))
  console.log("\n")
  console.log(chalk.green(' Build the project'))
  console.log(chalk.green(' tsx project.mts build                               ---build all targets'))
  console.log(chalk.green(' tsx project.mts build [target_name]                 ---build the target [target_name]'))
  console.log("\n")
  console.log(chalk.green(' Run the target'))
  console.log(chalk.green(' tsx project.mts run [target_name]                   ---run the target [target]'))
  console.log(chalk.green(' tsx project.mts run [target_name] [-- target_args]  ---run the target [target_name] with target_args'))
  console.log("\n")
  console.log(chalk.green(' Test the project'))
  console.log(chalk.green(' tsx project.mts test                                ---run all tests'))
  console.log(chalk.green(' tsx project.mts test [test_name]                    ---run the test [test_name]'))
  console.log("\n")
  console.log(chalk.green(' Pack the project'))
  console.log(chalk.green(' tsx project.mts pack                                ---pack the project'))
  console.log("\n")
  console.log(chalk.hex('0xa9cc00')('Usage: tsx project.mts <action> [target] [-- args]'))
  console.log(chalk.hex('0xa9cc00')('action: config | clean | build | run | test | install | pack'))
  console.log(chalk.hex('0xa9cc00')('target: the target to execute the action'))
  console.log(chalk.hex('0xa9cc00')('args: the arguments to pass to the target'))
}


async function main() {
  if (argv._.length == 0 || argv.h || argv.help) {
    showHelp()
    process.exit(0)
  }
  const myArgv = minimist(process.argv.slice(2), {
    ['--']: true
  })
  console.log(chalk.blue("Script args: ", myArgv._.join(' ')))
  if (myArgv['--'] !== undefined) {
    console.log(chalk.blue("Target args: ", myArgv['--'].join(' ')))
  }

  // To avoid user not reload the ternimal after install tools,refresh the env
  let cmdsNotFound = findCmdsInEnv(['cmake', 'conan', 'ninja', 'ctest']) // 'ccache'
  if (cmdsNotFound.length > 0) {
    console.log(chalk.redBright(`Some commands not found in path:${cmdsNotFound} ,Tring reload the environment...`))
    if (process.platform === 'win32') {
      refreshEnv('refreshenv')
    }
    else if (process.platform === 'linux') {
      refreshEnv('source ~/.profile')
    }
  }

  let targetContext = {
    target: '',
    args: '',
  }

  if (myArgv._[0] == 'setup') {
    console.log(chalk.greenBright('Running setup...'))
    if (myArgv._.length < 2) {
      console.error(chalk.redBright('Please specify a preset to setup'))
      process.exit(1)
    }
    const setup_preset: PresetContext = {
      presetsFilePath,
      selectedPreset: myArgv._[1],
    }
    new ProjectManager({ preset: setup_preset })
    return
  }

  const projectManager = new ProjectManager()
  const excutor = new Excutor(projectManager)

  switch (myArgv._[0]) {
    case 'clean':
      console.log(chalk.greenBright('Cleaning project...'))
      await excutor.clean()
      break
    case 'config':
      console.log(chalk.greenBright('Configuring project...'))
      await excutor.clean()
      await excutor.cmakeConfigure()
      break
    case 'build':
      targetContext.target = projectManager.buildTarget
      console.log(chalk.greenBright('Building project...'))
      if (myArgv._.length > 1) {
        console.log(chalk.greenBright('Building target:', myArgv._[1]))
        targetContext.target = myArgv._[1]
      } else {
        console.log(chalk.greenBright("Building all targets"))
        targetContext.target = 'all'
      }
      projectManager.setTargetContext(TargetType.Build, targetContext)
      await excutor.cmakeBuild()
      break
    case 'run':
      targetContext.target = projectManager.launchTarget
      targetContext.args = projectManager.launchArgs
      if (myArgv._.length > 1) {
        console.log(chalk.greenBright('Runing target:', myArgv._[1]))
        targetContext.target = myArgv._[1]
      }
      else if (targetContext.target != '') {
        console.log(chalk.greenBright('Runing target:', targetContext.target))
      }
      else {
        console.error(chalk.redBright("Please specify a target to run"))
        return
      }
      if (myArgv['--'] && myArgv['--'].length > 0) {
        console.log(chalk.greenBright('args:', myArgv['--'].join(' ')))
        targetContext.args = myArgv['--'].join(' ')
      }
      projectManager.setTargetContext(TargetType.Launch, targetContext)
      await excutor.runTarget()
      break
    case 'test':
      targetContext.args = projectManager.testArgs
      console.log(chalk.greenBright('Testing project...'))
      if (myArgv['--'] && myArgv['--'].length > 0) {
        targetContext.args = myArgv['--'].join(' ')
        projectManager.setTargetContext(TargetType.Test, targetContext)
      }
      await excutor.runTest()
      break
    case 'cov':
      targetContext.args = projectManager.testArgs
      console.log(chalk.greenBright('Getting Coverage of this project...'))
      if (myArgv['--'] && myArgv['--'].length > 0) {
        targetContext.args = myArgv['--'].join(' ')
        projectManager.setTargetContext(TargetType.Test, targetContext)
      }
      await excutor.runCov()
      break
    case 'install':
      console.log(chalk.greenBright('Installing project...'))
      await excutor.install()
      break
    case 'pack':
      console.log(chalk.greenBright('Packing project...'))
      await excutor.cpack()
      break
    default:
      showHelp()
      break
  }
}

main()
