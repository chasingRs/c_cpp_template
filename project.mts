import 'zx/globals'
import { throws } from 'assert'
import { PathOrFileDescriptor } from 'fs-extra'
import { MSVCInstallDir } from './scripts/consts.mjs'
import { setupMSVCDevCmd } from './scripts/setupMSVCDev.mts'
import { usePowerShell } from 'zx';
import { findCmdsInEnv, refreshEnv } from './scripts/envHelper.mts'

if (process.platform === 'win32') {
  usePowerShell()
}

// default is "set -euo pipefail;",
// `-u`: Treat unset variables as an error and exit immediately.
if (process.platform != 'win32') {
  $.prefix = "set -eo pipefail;"
}

function parseJson(json: PathOrFileDescriptor) {
  try {
    let content = fs.readFileSync(json, 'utf8')
    return JSON.parse(content)
  } catch (e) {
    console.error('error:', e)
    throws(e)
  }
}

interface SetupConfig {
  presetsFile: PathOrFileDescriptor,
  selectedPreset: string,
}

interface ChangeConfig {
  buildConfig?: {
    target: string
  }
  launchConfig?: {
    target: string
    args: string
  }
  testConfig?: {
    ctestArgs: string
  }
}

interface Config {
  configPath: PathOrFileDescriptor
  setup?: SetupConfig
}

class ProjectConfigs {
  configPath: PathOrFileDescriptor
  configureConfig: {
    preset: string,
    sourceDir: string,
    binaryDir: string,
    installDir: string,
    buildType: string,
  }
  buildConfig: {
    target: string,
  }
  launchConfig: {
    target: string,
    args: string,
  }
  testConfig: {
    ctestArgs: string,
  }

  changeConfig(config: ChangeConfig) {
    if (config.buildConfig) {
      this.buildConfig = {
        ...this.buildConfig,
        target: config.buildConfig.target
      }
    }
    if (config.launchConfig) {
      this.launchConfig = {
        ...this.launchConfig,
        target: config.launchConfig.target,
        args: config.launchConfig.args,
      }
    }
    if (config.testConfig) {
      this.testConfig = {
        ...this.testConfig,
        ctestArgs: config.testConfig.ctestArgs,
      }
    }
    this._save2File(this.configPath)
  }

  constructor(config: Config) {
    this.configPath = config.configPath
    if (config.setup) {
      this._setup(config.setup)
    }
    else
      try {
        const parsedConfig = this._fromJson(config.configPath)
        this.configureConfig = parsedConfig.configureConfig
        this.buildConfig = parsedConfig.buildConfig
        this.launchConfig = parsedConfig.launchConfig
        this.testConfig = parsedConfig.testConfig
        this._save2File(config.configPath)
      } catch (e) {
        console.error('Unable to parse config from json file, possibly forgot to run setup first?')
      }
  }

  // NOTE: Change follow to set a default value for each config
  _setup = function (setupConfig: SetupConfig) {
    const presets = parseJson(setupConfig.presetsFile)
    // for replace
    const sourceDir = process.cwd()
    const presetName = setupConfig.selectedPreset
    this.configureConfig = {
      preset: setupConfig.selectedPreset,
      sourceDir: process.cwd(),
      binaryDir: presets.configurePresets[0].binaryDir.replace(/\$\{(.*?)\}/g, (_, p1) => eval(p1)),
      installDir: presets.configurePresets[0].installDir.replace(/\$\{(.*?)\}/g, (_, p1) => eval(p1)),
      buildType: presets.configurePresets.find(item => item.name == setupConfig.selectedPreset).cacheVariables.CMAKE_BUILD_TYPE,
    }
    this.buildConfig = {
      target: "all"
    }
    this.launchConfig = {
      target: "",
      args: "",
    }
    this.testConfig = {
      ctestArgs: "",
    }
    this._save2File('project.json')
  }

  _save2File = function (filePath: PathOrFileDescriptor) {
    fs.writeFileSync(filePath, JSON.stringify(this, null, 2))
  }

  _fromJson(filePath: PathOrFileDescriptor) {
    return parseJson(filePath)
  }
}

class Excutor {
  projectConfigs: ProjectConfigs

  constructor(config: ProjectConfigs) {
    this.projectConfigs = config
  }

  clean = async function () {
    if (fs.existsSync(this.projectConfigs.configureConfig.binaryDir)) {
      await fs.remove(this.projectConfigs.configureConfig.binaryDir)
    }
  }

  cmakeConfigure = async function () {
    if (this.projectConfigs.configureConfig.preset.includes('msvc')) {
      setupMSVCDevCmd(
        "x64",
        MSVCInstallDir,
        undefined,
        undefined,
        false,
        false,
        undefined
      );
      const cmakeConfigreCommand = `"cmake -S . --preset=${this.projectConfigs.configureConfig.preset}"`
      await $`powershell -Command ${cmakeConfigreCommand}`.pipe(process.stderr)
      await $`Copy-Item -Path ${this.projectConfigs.configureConfig.binaryDir}\\compile_commands.json -Destination ${this.projectConfigs.configureConfig.sourceDir}`.pipe(process.stderr)
    } else {
      await $`cmake -S . --preset=${this.projectConfigs.configureConfig.preset}`.pipe(process.stderr)
      await $`ln -sfr ${this.projectConfigs.configureConfig.binaryDir}/compile_commands.json ${this.projectConfigs.configureConfig.sourceDir}/compile_commands.json `.pipe(process.stderr)
    }
  }

  cmakeBuild = async function () {
    if (this.projectConfigs.configureConfig.preset.includes('msvc')) {
      setupMSVCDevCmd(
        "x64",
        MSVCInstallDir,
        undefined,
        undefined,
        false,
        false,
        undefined
      );
      const cmakeBuildCommand = `"Invoke-Environment ${this.projectConfigs.configureConfig.binaryDir}\\conan\\build\\${this.projectConfigs.configureConfig.buildType}\\generators\\conanrun.bat;cmake --build ${this.projectConfigs.configureConfig.binaryDir} --target ${this.projectConfigs.buildConfig.target}"`

      await $`powershell -Command ${cmakeBuildCommand}`.pipe(process.stderr)
    } else {
      await $`cmake --build ${this.projectConfigs.configureConfig.binaryDir} --target ${this.projectConfigs.buildConfig.target} `.pipe(process.stderr)
    }
  }

  runTarget = async function () {
    if (process.platform === 'win32') {
      const runTargetCommand = `"Invoke-Environment ${this.projectConfigs.configureConfig.binaryDir}\\conan\\build\\${this.projectConfigs.configureConfig.buildType}\\generators\\conanrun.bat;${this.projectConfigs.configureConfig.binaryDir}\\bin\\${this.projectConfigs.launchConfig.target} ${this.projectConfigs.launchConfig.args}"`
      await $`powershell -Command ${runTargetCommand}`.pipe(process.stderr)
    } else {
      await $`source ${this.projectConfigs.configureConfig.binaryDir}/conan/build/${this.projectConfigs.configureConfig.buildType}/generators/conanrun.sh && ${this.projectConfigs.configureConfig.binaryDir}/bin/${this.projectConfigs.launchConfig.target} ${this.projectConfigs.launchConfig.args}`.pipe(process.stderr)
    }
  }

  runTest = async function () {
    if (process.platform === 'win32') {
      const runTestCommand = `"Invoke-Environment ${this.projectConfigs.configureConfig.binaryDir}\\conan\\build\\${this.projectConfigs.configureConfig.buildType}\\generators\\conanrun.bat;ctest --preset ${this.projectConfigs.configureConfig.preset} ${this.projectConfigs.testConfig.ctestArgs}"`
      await $`powershell -Command ${runTestCommand}`.pipe(process.stderr)
    } else {
      await $`source ${this.projectConfigs.configureConfig.binaryDir}/conan/build/${this.projectConfigs.configureConfig.buildType}/generators/conanrun.sh && ctest --preset ${this.projectConfigs.configureConfig.preset} ${this.projectConfigs.testConfig.ctestArgs}`.pipe(process.stderr)
    }
  }

  cpack = async function () {
    if (process.platform === 'win32') {
      const cpackCommand = `"Invoke-Environment ${this.projectConfigs.configureConfig.binaryDir}\\conan\\build\\${this.projectConfigs.configureConfig.buildType}\\generators\\conanrun.bat;cd ${this.projectConfigs.configureConfig.binaryDir};cpack"`
      await $`powershell -Command ${cpackCommand}`.pipe(process.stderr)
    } else {
      await $`cd ${this.projectConfigs.configureConfig.binaryDir} && cpack`.pipe(process.stderr)
    }
  }
}

// This script is used to run target flexible
// usage: project.mjs <action> [target] [-- args]
// for example: 

// Get help
// tsx project.mts                          --------show help
// tsx project.mts -h                       --------show help
// tsx project.mts --help                   --------show help

// Setup the project(select a cmake preset, parse and store it)
// tsx project.mts setup  some_preset       --------setup the project with specified preset

// Clean the project
// tsx project.mts clean                    --------clean project

// Cmake configure
// tsx project.mts config                   --------run cmake configure

// Build the project
// tsx project.mts build                    --------build all targets
// tsx project.mts build some_target        --------build the target 'some_target'

// Run the target
// tsx project.mts run some_target          --------run the target 'some_target'
// tsx project.mts run some_target -- args  --------run the target 'some_target' with args

// Test the project
// tsx project.mts test                     --------run all tests
// tsx project.mts test some_test           --------run the test 'some_test'

// Pack the project
// tsx project.mts pack                     --------pack the project


function showHelp() {
  console.log(chalk.greenBright('Usage: tsx project.mts <action> [target] [args]'))
  console.log(chalk.greenBright('action: clean | build | run | test | config'))
  console.log(chalk.greenBright('target: the target to run'))
  console.log(chalk.greenBright('args: the arguments to pass to the target'))
}


async function main() {
  const configPath = 'project.json'
  const presetsFile = 'CMakePresets.json'

  console.log(argv)
  if (argv._.length == 0 || argv.h || argv.help) {
    showHelp()
  }

  const myArgv = minimist(process.argv.slice(2), {
    ['--']: true
  })

  let changeConfig = {
    buildConfig: {
      target: 'all'
    },
    launchConfig: {
      target: '',
      args: '',
    },
    testConfig: {
      ctestArgs: ''
    }
  }

  // await excutor.cmakeGenerate()
  // await excutor.cmakeBuild()

  if (myArgv._[0] == 'setup') {
    // To avoid user not reload the ternimal after install tools,refresh the env
    let cmdNotFound = findCmdsInEnv(['cmake', 'conan', 'ninja', 'ccache', 'ctest'])
    if (cmdNotFound.length > 0) {
      console.log(chalk.redBright(`Some commands not found in path:${cmdNotFound} ,Tring reload the environment...`))
      if (process.platform === 'win32') {
        refreshEnv('refreshenv')
      }
      else if (process.platform === 'linux') {
        refreshEnv('source ~/.bashrc')
      }
    }
    console.log('Running setup...')
    if (myArgv._.length < 2) {
      console.error('Please specify a preset to setup')
      process.exit(1)
    }
    const setup = {
      presetsFile,
      selectedPreset: myArgv._[1],
    }
    new ProjectConfigs({ configPath, setup })
    return
  }

  const config = new ProjectConfigs({ configPath })
  const excutor = new Excutor(config)

  switch (myArgv._[0]) {
    case 'clean':
      console.log('Cleaning project...')
      await excutor.clean()
      break
    case 'config':
      console.log('Configuring project...')
      await excutor.clean()
      await excutor.cmakeConfigure()
      break
    case 'build':
      console.log('Building project...')
      if (myArgv._.length > 1) {
        console.log('building target:', myArgv._[0])
        changeConfig.buildConfig.target = myArgv._[0]
      } else {
        console.log("Building all targets")
        changeConfig.buildConfig.target = 'all'
      }
      config.changeConfig(changeConfig)
      await excutor.cmakeBuild()
      break
    case 'run':
      console.log('Running target...')
      if (myArgv._.length > 1) {
        console.log('runing target:', myArgv._[1])
        changeConfig.launchConfig.target = myArgv._[1]
        if (myArgv['--']) {
          console.log('args:', myArgv['--'].join(' '))
          changeConfig.launchConfig.args = myArgv['--'].join(' ')
        }
      } else {
        console.error("Please specify a target to run")
        return
      }
      config.changeConfig(changeConfig)
      await excutor.runTarget()
      break
    case 'test':
      console.log('Testing project...')
      if (myArgv['--']) {
        console.log('args:', myArgv['--'].join(' '))
        changeConfig.testConfig.ctestArgs = myArgv['--'].join(' ')
        config.changeConfig(changeConfig)
        await excutor.runTest()
      }
      break
    case 'pack':
      console.log('Packing project...')
      await excutor.cpack()
      break
    default:
      showHelp()
      break
  }
}
main()
