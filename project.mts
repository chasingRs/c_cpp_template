import { PathOrFileDescriptor } from 'fs'
import { usePowerShell } from 'zx'
import 'zx/globals'
import { MSVCInstallDir } from './scripts/consts.mjs'
import { refreshEnv, getEnvDiff } from './scripts/envHelper.mts'
import { setupMSVCDevCmd } from './scripts/setupMSVCDev.mts'
import { findCmdsInEnv, loadFromJson, saveToJson, replaceJsonNode } from './scripts/utils.mts'

const cachePath = '.project_cache.json'
const presetsFilePath = 'CMakePresets.json'
let scriptPostfix = ''
let sourceCommandPrefix = ''

const $$ = $({ stdio: 'inherit' })

if (process.platform === 'win32') {
  usePowerShell()
  scriptPostfix = 'bat'
  sourceCommandPrefix = ""
}

if (process.platform === 'linux') {
  scriptPostfix = 'sh'
  sourceCommandPrefix = "source " // Attention: space after source
}

interface CmakeOptionsContext {
  packagingMaintainerMode: boolean,
  warningsAsErrors: boolean,
  enableClangTidy: boolean,
  enableCppcheck: boolean,
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

interface CmakePresetContext {
  presetsFilePath: PathOrFileDescriptor,
  selectedPreset: string,
}

enum TargetType {
  Build,
  Launch,
  Test,
}

interface TargetContext {
  target: string[]
  args: string[]
}

interface SetupContext {
  cmakePreset: CmakePresetContext
}

interface ProjectContext {
  projectName: string
  // decided by the preset
  cmakePreset: string
  sourceDir: string
  binaryDir: string
  installDir: string
  buildType: string
  // decided by the user
  buildTarget: string[]
  launchTarget: string[]
  launchArgs: string[]
  testArgs: string[]
}

// Setup => Config => Build => Run|Test|Cov|Install|Pack
// Run Cov without COVRAGE Flag On should back to Config
enum State {
  Setup,
  Clean,
  Config,
  Build,
  Run,
  Test,
  Cov,
  Install,
  Pack
}

interface StateMachine {
  // last time the project was configured with a temporary contex, need to reload from cache
  currentState: State
}

class ProjectContext {
  cachePath: PathOrFileDescriptor
  projectContext: ProjectContext
  cmakeOptionsContext: CmakeOptionsContext
  stateMachine: StateMachine

  setTargetContext(type: TargetType, context: TargetContext) {
    switch (type) {
      case TargetType.Build:
        this.projectContext.buildTarget = context.target
        break
      case TargetType.Launch:
        this.projectContext.launchTarget = context.target
        this.projectContext.launchArgs = context.args
        break
      case TargetType.Test:
        this.projectContext.testArgs = context.args
        break
    }
  }

  constructor(setup?: SetupContext) {
    this.cachePath = cachePath
    if (setup) {
      this.setup(setup.cmakePreset)
    }
    else
      try {
        const parsedCache = loadFromJson(this.cachePath)
        this.projectContext = parsedCache.projectContext
        this.cmakeOptionsContext = parsedCache.cmakeOptionsContext
        this.stateMachine = parsedCache.stateMachine
      } catch (e) {
        throw new Error('Failed to load cache file, please run setup first')
      }
  }

  // NOTE: Change following to set a default value for each config
  private setup = function (preset: CmakePresetContext) {
    try {
      const presets = loadFromJson(preset.presetsFilePath)
      // these variables is used by 'eval' command bellow
      const sourceDir = process.cwd()
      const presetName = preset.selectedPreset
      const env = dotenv.parse(fs.readFileSync('./.github/constants.env'))
      this.projectContext = {
        cmakePreset: preset.selectedPreset,
        sourceDir: process.cwd(),
        buildTarget: ['all'],
        launchTarget: [],
        launchArgs: [],
        testArgs: [],
        projectName: env.PROJECT_NAME,
        binaryDir: presets.configurePresets[0].binaryDir.replace(/\$\{(.*?)\}/g, (_, p1) => eval(p1)),
        installDir: presets.configurePresets[0].installDir.replace(/\$\{(.*?)\}/g, (_, p1) => eval(p1)),
        buildType: presets.configurePresets.find(item => item.name == preset.selectedPreset).cacheVariables.CMAKE_BUILD_TYPE
      }
    } catch (e) {
      throw new Error('Failed to parser cmake presets, please check the exists of this preset or the format of the preset')
    }
    this.cmakeOptionsContext = {
      packagingMaintainerMode: true,
      warningsAsErrors: false,
      enableClangTidy: false,
      enableCppcheck: false,
      enableSanitizerLeak: true,
      enableSanitizerUndefined: true,
      enableSanitizerThread: false,
      enableSanitizerMemory: false,
      enableSanitizerAddress: true,
      enableUnityBuild: false,
      enablePch: false,
      enableCache: false,
      enableIpo: false,
      enableUserLinker: false,
      enableCoverage: false,
      buildFuzzTests: false,
      enableHardening: false,
      enableGlobalHardening: false,
      gitSha: process.env.GITHUB_SHA ? process.env.GITHUB_SHA : 'unkown'
    }
    this.stateMachine = {
      currentState: State.Setup
    }
  }

  save2File = function () {
    saveToJson(this.cachePath, {
      projectContext: this.projectContext,
      cmakeOptionsContext: this.cmakeOptionsContext,
      stateMachine: this.stateMachine
    })
  }
}

class Excutor {
  context: ProjectContext

  constructor(context: ProjectContext) {
    this.context = context
  }

  private camelToSnake = function (str: string) {
    return str.replace(/[A-Z]/g, letter => `_${letter}`)
  }
  private cmakeOptionsTransform = function () {
    let cmakeOptions: string[] = []
    for (const [key, value] of Object.entries(this.context.cmakeOptionsContext)) {
      if (typeof value === 'boolean')
        cmakeOptions.push(`-D${this.context.projectContext.projectName}_${this.camelToSnake(key).toUpperCase()}:BOOL=${value ? 'ON' : 'OFF'}`)
      else
        cmakeOptions.push(`-D${this.camelToSnake(key).toUpperCase()}:STRING=${value}`)
    }
    return cmakeOptions
  }

  private async excutecheckExitCode(cmd: string, errorMsg: string) {
    if (process.platform === 'win32') {
      if (await $$`powershell -Command ${cmd}`.exitCode !== 0) {
        throw new Error(errorMsg)
      }
    } else if (process.platform === 'linux') {
      if (await $$`bash -c ${cmd}`.exitCode !== 0) {
        throw new Error(errorMsg)
      }
    }
  }

  clean = async function () {
    if (fs.existsSync("compile_commands.json")) {
      await fs.unlink("compile_commands.json")
    }
    await fs.remove("out")
  }

  cmakeConfigure = async function () {
    if (this.context.stateMachine.currentState === State.Clean) {
      await this.clean()
    }
    if (process.platform === 'win32') {
      setupMSVCDevCmd(
        "x64",
        MSVCInstallDir,
        undefined,
        undefined,
        false,
        false,
        undefined
      );
      const cmakeConfigreCmd = `"cmake -S . --preset=${this.context.projectContext.cmakePreset} ${this.cmakeOptionsTransform().join(' ')}"`.trim()
      const copyCompileCommandsCmd = `"if (Test-Path ${this.context.projectContext.sourceDir}/compile_commands.json) { Remove-Item ${this.context.projectContext.sourceDir}/compile_commands.json } New-Item -ItemType SymbolicLink -Path ${this.context.projectContext.sourceDir}/compile_commands.json -Target ${this.context.projectContext.binaryDir}/compile_commands.json"`
      await this.excutecheckExitCode(cmakeConfigreCmd, 'Cmake configure failed')
      await this.excutecheckExitCode(copyCompileCommandsCmd, 'Unable to create compile_commands.json')
    } else if (process.platform === 'linux') {
      const cmakeConfigreCmd = `cmake -S . --preset=${this.context.projectContext.cmakePreset} ${this.cmakeOptionsTransform().join(' ')}`.trim()
      const copyCompileCommandsCmd = `ln -sfr ${this.context.projectContext.binaryDir}/compile_commands.json ${this.context.projectContext.sourceDir}/compile_commands.json`
      await this.excutecheckExitCode(cmakeConfigreCmd, 'Cmake configure failed')
      await this.excutecheckExitCode(copyCompileCommandsCmd, 'Unable to create compile_commands.json')
    } else {
      throw new Error('Unsupported platform or compiler,Only support msvc on windows and gcc on linux')
    }
  }

  cmakeBuild = async function () {
    if (this.context.stateMachine.currentState < State.Config) {
      await this.cmakeConfigure()
    }
    refreshEnv(`${sourceCommandPrefix}${this.context.projectContext.binaryDir}/conan/build/${this.context.projectContext.buildType}/generators/conanbuild.${scriptPostfix}`)
    refreshEnv(`${sourceCommandPrefix}${this.context.projectContext.binaryDir}/conan/build/${this.context.projectContext.buildType}/generators/conanrun.${scriptPostfix}`)
    if (process.platform === 'win32') {
      setupMSVCDevCmd(
        "x64",
        MSVCInstallDir,
        undefined,
        undefined,
        false,
        false,
        undefined
      );
      const cmakeBuildCmd = `"cmake --build ${this.context.projectContext.binaryDir} --target ${this.context.projectContext.buildTarget.join(' ')}"`.trim()
      await this.excutecheckExitCode(cmakeBuildCmd, 'Build failed')
    } else if (process.platform === 'linux') {
      const cmakeBuildCmd = `cmake --build ${this.context.projectContext.binaryDir} --target ${this.context.projectContext.buildTarget.join(' ')}`.trim()
      await this.excutecheckExitCode(cmakeBuildCmd, 'Build failed')
    } else {
      throw new Error('Unsupported platform or compiler,Only support msvc on windows and gcc on linux')
    }
  }

  runTarget = async function () {
    // TODO: Clean this
    if (this.context.cmakeOptionsContext.enableCoverage === true) {
      // Need to reconfigure the project
    }
    if (this.context.stateMachine.currentState < State.Build) {
      await this.cmakeBuild()
    }
    this.context.projectContext.buildTarget = this.context.projectContext.launchTarget
    refreshEnv(`${sourceCommandPrefix}${this.context.projectContext.binaryDir}/conan/build/${this.context.projectContext.buildType}/generators/conanrun.${scriptPostfix}`)
    if (process.platform === 'win32') {
      setupMSVCDevCmd(
        "x64",
        MSVCInstallDir,
        undefined,
        undefined,
        false,
        false,
        undefined
      );
      // WARN: Only run the first target
      const runTargetCmd = `"${this.context.projectContext.binaryDir}/bin/${this.context.projectContext.launchTarget[0]}.exe ${this.context.projectContext.launchArgs.join(' ')}"`.trim()
      await this.excutecheckExitCode(runTargetCmd, 'Run target failed')
    } else if (process.platform === 'linux') {
      const runTargetCmd = `${this.context.projectContext.binaryDir}/bin/${this.context.projectContext.launchTarget[0]} ${this.context.projectContext.launchArgs.join(' ')}`.trim()
      await this.excutecheckExitCode(runTargetCmd, 'Run target failed')
    } else {
      throw new Error('Unsupported platform or compiler,Only support msvc on windows and gcc on linux')
    }
  }
  runTest = async function () {
    if (this.context.stateMachine.currentState < State.Build || this.context.projectContext.buildTarget[0] != 'all') {
      this.context.projectContext.buildTarget = ['all']
      await this.cmakeBuild()
    }
    refreshEnv(`${sourceCommandPrefix}${this.context.projectContext.binaryDir}/conan/build/${this.context.projectContext.buildType}/generators/conanrun.${scriptPostfix}`)
    if (process.platform === 'win32') {
      setupMSVCDevCmd(
        "x64",
        MSVCInstallDir,
        undefined,
        undefined,
        false,
        false,
        undefined
      );
      const runTestCommand = `"ctest --preset ${this.context.projectContext.cmakePreset} ${this.context.projectContext.testArgs.join(' ')}"`.trim()
      await this.excutecheckExitCode(runTestCommand, 'Run test failed')
    } else if (process.platform === 'linux') {
      const runTestCmd = `ctest --preset ${this.context.projectContext.cmakePreset} ${this.context.projectContext.testArgs.join(' ')}`.trim()
      await this.excutecheckExitCode(runTestCmd, 'Run test failed')
    } else {
      throw new Error('Unsupported platform or compiler,Only support msvc on windows and gcc on linux')
    }
  }

  runCov = async function () {
    if (this.context.stateMachine.currentState < State.Build) {
      await this.cmakeBuild()
    }
    await fs.ensureDir('out/coverage')
    refreshEnv(`${sourceCommandPrefix}${this.context.projectContext.binaryDir}/conan/build/${this.context.projectContext.buildType}/generators/conanrun.${scriptPostfix}`)
    if (process.platform === 'win32') {
      setupMSVCDevCmd(
        "x64",
        MSVCInstallDir,
        undefined,
        undefined,
        false,
        false,
        undefined
      );
      const runCovCmd = `"cd out/coverage;OpenCppCoverage.exe --working_dir ${this.context.projectContext.binaryDir} --export_type cobertura:coverage.xml --cover_children -- ctest ${this.context.projectContext.testArgs.join(' ')}"`.trim()
      await this.excutecheckExitCode(runCovCmd, 'Run coverage failed')
    } else if (process.platform === 'linux') {
      const runTestCmd = `ctest --preset ${this.context.projectContext.cmakePreset} ${this.context.projectContext.testArgs.join(' ')}`.trim()
      const runCovCmd = `gcovr --delete --root . --print-summary --xml-pretty --xml out/coverage/coverage.xml . --gcov-executable gcov`
      await this.excutecheckExitCode(runTestCmd, 'Run test failed')
      await this.excutecheckExitCode(runCovCmd, 'Run coverage failed')
    } else {
      throw new Error('Unsupported platform or compiler,Only support msvc on windows and gcc on linux')
    }
  }

  install = async function () {
    if (this.context.stateMachine.currentState < State.Build) {
      await this.cmakeBuild()
    }
    if (process.platform === 'win32') {
      setupMSVCDevCmd(
        "x64",
        MSVCInstallDir,
        undefined,
        undefined,
        false,
        false,
        undefined
      );
      const cpackCommand = `"cmake --install ${this.context.projectContext.binaryDir}"`
      await this.excutecheckExitCode(cpackCommand, 'Install failed')
    } else if (process.platform === 'linux') {
      const installCmd = `cmake --install ${this.context.projectContext.binaryDir}`
      await this.excutecheckExitCode(installCmd, 'Install failed')
    } else {
      throw new Error('Unsupported platform or compiler,Only support msvc on windows and gcc on linux')
    }
  }

  cpack = async function () {
    if (this.context.stateMachine.currentState < State.Build) {
      await this.cmakeBuild()
    }
    if (process.platform === 'win32') {
      setupMSVCDevCmd(
        "x64",
        MSVCInstallDir,
        undefined,
        undefined,
        false,
        false,
        undefined
      );
      const cpackCommand = `"cd ${this.context.projectContext.binaryDir};cpack"`
      await this.excutecheckExitCode(cpackCommand, 'Pack failed')
    } else if (process.platform === 'linux') {
      const cpackCmd = `cd ${this.context.projectContext.binaryDir} && cpack`
      await this.excutecheckExitCode(cpackCmd, 'Pack failed')
    } else {
      throw new Error('Unsupported platform or compiler,Only support msvc on windows and gcc on linux')
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
  console.log(chalk.blue("Script args:", myArgv._.join(' ')))
  if (myArgv['--'] !== undefined) {
    console.log(chalk.blue("Target args:", myArgv['--'].join(' ')))
  }

  // To avoid user not reload the ternimal after install tools,refresh the env
  let cmdsNotFound = findCmdsInEnv(['cmake', 'conan', 'ninja', 'ctest']) // 'ccache'
  if (cmdsNotFound.length > 0) {
    console.log(chalk.yellowBright(`Some commands not found in path:${cmdsNotFound} ,Tring reload the environment...`))
    if (process.platform === 'win32') {
      refreshEnv('refreshenv')
    }
    else if (process.platform === 'linux') {
      refreshEnv('source ~/.profile')
    }
  }

  let targetContext = {
    target: new Array<string>(),
    args: new Array<string>()
  }

  if (myArgv._[0] == 'setup') {
    console.log(chalk.greenBright('Running setup...'))
    if (myArgv._.length < 2) {
      throw new Error('Please specify a preset to setup')
    }
    const setup_preset: CmakePresetContext = {
      presetsFilePath,
      selectedPreset: myArgv._[1],
    }
    let context = new ProjectContext({ cmakePreset: setup_preset })
    // remember to save the context to file
    context.save2File()
    return
  }

  const context = new ProjectContext()
  const excutor = new Excutor(context)
  let argsReuse = false

  if (myArgv._[0].endsWith('!')) {
    // Reuse last args
    argsReuse = true
    myArgv._[0] = myArgv._[0].substring(0, myArgv._[0].length - 1)
  }

  // To auto rebuild the project when the coverage is disabled,
  // handle 'cov' command specially
  if (myArgv._[0] == 'cov') {
    console.log(chalk.greenBright('Running Coverage of this project...'))
    // Handle args
    if (argsReuse) {
      targetContext.args = context.projectContext.testArgs
    } else if (myArgv['--'] && myArgv['--'].length > 0) {
      targetContext.args = myArgv['--']
    }
    context.setTargetContext(TargetType.Test, targetContext)

    if (context.cmakeOptionsContext.enableCoverage === false && context.stateMachine.currentState !== State.Cov) {
      console.log(chalk.yellowBright('Coverage is not enabled, trying to enable it and build again...'))
      context.cmakeOptionsContext.enableCoverage = true
      context.stateMachine.currentState = State.Setup
      await excutor.runCov()
      context.cmakeOptionsContext.enableCoverage = false
    } else {
      await excutor.runCov()
    }
    context.stateMachine.currentState = State.Cov
  } else {
    if (context.cmakeOptionsContext.enableCoverage === false && context.stateMachine.currentState === State.Cov && myArgv._[0] != 'clean') {
      console.log(chalk.yellowBright('Last time run cmake configure with COVERAGE flag ON temporarily, disable it and reconfigure the project...'))
      // need to reconfigure the project
      context.stateMachine.currentState = State.Setup
    }
    switch (myArgv._[0]) {
      case 'clean':
        console.log(chalk.greenBright('Cleaning project...'))
        await excutor.clean()
        context.stateMachine.currentState = State.Clean
        break
      case 'config':
        console.log(chalk.greenBright('Configuring project...'))
        await excutor.cmakeConfigure()
        context.stateMachine.currentState = State.Config
        // export env to .vscode/launch.json
        const envList = getEnvDiff(`${sourceCommandPrefix}${context.projectContext.binaryDir}/conan/build/${context.projectContext.buildType}/generators/conanrun.${scriptPostfix}`)
        replaceJsonNode('.vscode/launch.json', "configurations", ["type", "lldb"], "env", Object.fromEntries(envList))
        break
      case 'build':
        targetContext.target = context.projectContext.buildTarget
        if (myArgv._.length > 1) {
          console.log(chalk.greenBright('Building target:', myArgv._.slice(1).join(',')))
          targetContext.target = myArgv._.slice(1)
        } else {
          console.log(chalk.greenBright("Building all targets"))
          targetContext.target = ['all']
        }
        context.setTargetContext(TargetType.Build, targetContext)
        await excutor.cmakeBuild()
        context.stateMachine.currentState = State.Build
        break
      case 'run':
        targetContext.target = context.projectContext.launchTarget
        if (argsReuse) {
          targetContext.args = context.projectContext.launchArgs
        }
        if (context.stateMachine.currentState > State.Config) {
          // Force to rebuild the target as some files may be changed
          context.stateMachine.currentState = State.Config
        }
        if (myArgv._.length > 1) {
          console.log(chalk.greenBright('Runing target:', myArgv._[1]))
          targetContext.target = myArgv._.slice(1)
        }
        else if (targetContext.target.length !== 0) {
          console.log(chalk.greenBright('Runing target:', targetContext.target.join(' ')))
        }
        else {
          throw new Error("Please specify a target to run")
        }
        if (myArgv['--'] && myArgv['--'].length > 0) {
          console.log(chalk.greenBright('args:', myArgv['--'].join(' ')))
          targetContext.args = myArgv['--']
        }
        context.setTargetContext(TargetType.Launch, targetContext)
        await excutor.runTarget()
        context.stateMachine.currentState = State.Run
        // export args to .vscode/launch.json and .vscode/tasks.json
        replaceJsonNode('.vscode/launch.json', "configurations", ["type", "lldb"], "program", `${context.projectContext.binaryDir}/bin/${targetContext.target}`)
        replaceJsonNode('.vscode/launch.json', "configurations", ["type", "lldb"], "args", targetContext.args)
        break
      case 'test':
        if (argsReuse) {
          targetContext.args = context.projectContext.testArgs
        }
        context.stateMachine.currentState = State.Config
        console.log(chalk.greenBright('Testing project...'))
        if (myArgv['--'] && myArgv['--'].length > 0) {
          console.log(chalk.greenBright('args:', myArgv['--'].join(' ')))
          targetContext.args = myArgv['--']
          context.setTargetContext(TargetType.Test, targetContext)
        }
        await excutor.runTest()
        context.stateMachine.currentState = State.Test
        replaceJsonNode('.vscode/tasks.json', "tasks", ["group.kind", "test"], "args", targetContext.args)
        break
      case 'install':
        context.stateMachine.currentState = State.Config
        console.log(chalk.greenBright('Installing project...'))
        await excutor.install()
        context.stateMachine.currentState = State.Install
        break
      case 'pack':
        context.stateMachine.currentState = State.Config
        console.log(chalk.greenBright('Packing project...'))
        await excutor.cpack()
        context.stateMachine.currentState = State.Pack
        break
      default:
        showHelp()
        break
    }
  }
  // remember to save the context to file
  context.save2File()
}

try {
  await main()
} catch (e) {
  console.error(chalk.redBright(e))
}
