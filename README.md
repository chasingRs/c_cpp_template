# c_cpp_template

[![windows-build](https://github.com/chasingRs/c_cpp_template/actions/workflows/windows-build.yml/badge.svg)](https://github.com/chasingRs/c_cpp_template/actions/workflows/windows-build.yml)
[![linux-build](https://github.com/chasingRs/c_cpp_template/actions/workflows/linux-build.yml/badge.svg)](https://github.com/chasingRs/c_cpp_template/actions/workflows/linux-build.yml)
[![codecov](https://codecov.io/gh/chasingRs/c_cpp_template/branch/main/graph/badge.svg)](https://codecov.io/gh/chasingRs/c_cpp_template)
[![CodeQL](https://github.com/chasingRs/c_cpp_template/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/chasingRs/c_cpp_template/actions/workflows/codeql-analysis.yml)

## About c_cpp_template

> Note: This Project is a fork of [cpp-best-practices/cmake_template](https://github.com/cpp-best-practices/cmake_template)

- CMakeLists.txt with modern target-based syntax
- conanfile.py/conanfile.txt for dependency specification
- CI/CD ready scripts (build, test, pack and publish releases)
- Cross-platform support (Linux/Windows/macOS)
  
By default (collectively known as `ENABLE_DEVELOPER_MODE`)

- Address Sanitizer and Undefined Behavior Sanitizer enabled where possible
- Warnings as errors
- clang-tidy and cppcheck static analysis
- conan for dependencies management

It includes

- a basic CLI example with multiple modern C++ libraries:
  - **OpenCV** for computer vision capabilities
  - **spdlog** for fast logging
  - **CLI11** for command-line parsing
  - **dbg-macro** for debugging
  - **jsoncpp** for JSON handling
- examples for fuzz, unit, and constexpr testing
- large GitHub action testing matrix
- TypeScript project management script (`project.mts`) for streamlined build workflows

It requires

- **cmake** (3.27+)
- **ninja** (build system)
- **gcc/MSVC** (mainly support) or **clang** (May have bugs)
- **conan** (dependency management)
- **node.js** & **npm** (for TypeScript project management)
- **tsx** (TypeScript runner): `npm i -g tsx`

## Getting Started

### Use the GitHub template

First, click the green `Use this template` button near the top of this page.
This will take you to GitHub's ['Generate Repository'](https://github.com/chasingRs/c_cpp_template/generate)
page.
Fill in a repository name and short description, and click 'Create repository from template'.
This will allow you to create a new repository in your GitHub account,
prepopulated with the contents of this project.

After creating the project please wait until the cleanup workflow has finished
setting up your project and committed the changes.

Now you can clone the project locally and get to work!

    git clone https://github.com/<user>/<your_new_repo>.git

### How to use

#### Sample Application

The template includes a sample CLI application (`intro`) that demonstrates integration with multiple modern C++ libraries:

- **Command-line interface** using CLI11 with version flag support
- **Logging** with spdlog (debug level enabled)
- **Debugging** with dbg-macro for enhanced debug output
- **Computer Vision** with OpenCV (displays build information)
- **JSON processing** capabilities with jsoncpp

Run the sample application:
```sh
# Build and run the intro application
tsx project.mts build intro
tsx project.mts run intro

# Show version information
tsx project.mts run intro -- --version
```

#### Packages management

1. Adding the packages you need to `conanfile.py` (requirements section)
2. Modify the CMakeLists.txt in `src/your_target_directory` to link the target libraries
3. Conan will automatically manage these dependencies during the build process

#### Build your project

1. **Install Prerequisites:**

**For Windows:**
- `choco` (Chocolatey package manager)
- `node.js`, `npm`
- `tsx`: `npm i -g tsx`
- `Visual Studio 2022` with MSVC
- `cmake`
- `ninja`
- `python`, `pip`
- `conan`
- `OpenCppCoverage` (optional)
- `ccache` (optional)

You can run the following command to install these prerequisites:

```bat
cd ./scripts
./setup.bat
```

---

**For Linux:**
- `node.js`, `npm`
- `tsx`: `npm i -g tsx`
- `gcc`, `g++`
- `python`, `pip`
- `cmake`
- `ninja`
- `conan`
- `gcovr` (optional)
- `ccache` (optional)

You can run the following command to install these prerequisites:

```sh
cd ./scripts
./setup.sh
```

2. **Build, test, and package using the TypeScript project manager:**

```sh
# Choose a cmake preset to setup. Available presets:
# - Linux/macOS: 'unixlike-gcc-debug', 'unixlike-gcc-release', 'unixlike-clang-debug', 'unixlike-clang-release'
# - ARM64: 'unixlike-aarch64-gcc-debug', 'unixlike-aarch64-gcc-release'
tsx project.mts setup unixlike-gcc-debug

# Configure the project
tsx project.mts config

# Build all targets (or specify a target: tsx project.mts build intro)
tsx project.mts build

# Run tests
tsx project.mts test

# Package the project
tsx project.mts pack
```

**Additional project.mts commands:**
```sh
# Clean the project
tsx project.mts clean

# Run a specific target (e.g., the intro CLI app)
tsx project.mts run intro

# Run with arguments
tsx project.mts run intro -- --version

# Show help for all available commands
tsx project.mts --help
```

## More Details

- [Dependency Setup](README_dependencies.md)
- [Building Details](README_building.md)

## Fuzz testing

See [libFuzzer Tutorial](https://github.com/google/fuzzing/blob/master/tutorial/libFuzzerTutorial.md)
