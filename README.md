# cmake_template

[![windows-build](https://github.com/PongKJ/c_cpp_template/actions/workflows/windows-build.yml/badge.svg)](https://github.com/PongKJ/c_cpp_template/actions/workflows/windows-build.yml)
[![linux-build](https://github.com/PongKJ/c_cpp_template/actions/workflows/linux-build.yml/badge.svg)](https://github.com/PongKJ/c_cpp_template/actions/workflows/linux-build.yml)
[![codecov](https://codecov.io/gh/PongKJ/c_cpp_template/branch/main/graph/badge.svg)](https://codecov.io/gh/PongKJ/c_cpp_template)
[![CodeQL](https://github.com/PongKJ/c_cpp_template/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/PongKJ/c_cpp_template/actions/workflows/codeql-analysis.yml)

## About cmake_template

This is a C++ Best Practices GitHub template for getting up and running with C++ quickly.

By default (collectively known as `ENABLE_DEVELOPER_MODE`)

- Address Sanitizer and Undefined Behavior Sanitizer enabled where possible
- Warnings as errors
- clang-tidy and cppcheck static analysis
- conan for dependencies management

It includes

- a basic CLI example
- examples for fuzz, unit, and constexpr testing
- large GitHub action testing matrix
- opencv package build managed by conan

It requires

- cmake
- ninja
- a compiler
- conan
- node

This project gets you started with a simple example of using FTXUI, which happens to also be a game.

## Getting Started

### Use the GitHub template

First, click the green `Use this template` button near the top of this page.
This will take you to GitHub's ['Generate Repository'](https://github.com/cpp-best-practices/cmake_template/generate)
page.
Fill in a repository name and short description, and click 'Create repository from template'.
This will allow you to create a new repository in your GitHub account,
prepopulated with the contents of this project.

After creating the project please wait until the cleanup workflow has finished
setting up your project and committed the changes.

Now you can clone the project locally and get to work!

    git clone https://github.com/<user>/<your_new_repo>.git

### How to use

#### Packages management

1. Adding the packages you need to conandata.yml
2. Modify the CMakeLists.txt in src/dir_name_add_by_user to link the target lib
3. Conan will try to automatically manage these dependencies

#### Build your project
1. Firstly,install Prerequisities:

For windows:

`choco`
`node,npm`
`tsx`: `npm i -g tsx`
`MSVC-2022`
`cmake`
`ninja`
`python,pip`
`conan`
`OpenCppCoverage`(optional)
`ccache`(optional)

you can run following command to install these prerequisities:
```bat
cd ./scripts
./setup.bat
```
--------------------

For linux:

`node,npm`
`tsx`: `npm i -g tsx`
`gcc,g++`
`python,pip`
`cmake`
`ninja`
`conan`
`opencc`
`gcovr`(optional)
`ccache`(optional)

you can run following command to install these prerequisities:
```sh
cd ./scripts
./setup.sh
```
2. Run script to build, test and pack
``` sh
# Chose 'unixlike-gcc-debug' as cmake preset to setup, possible choice are: 'unixlike-gcc-release', 
# 'windows-msvc-debug-developer-mode','windows-msvc-release-developer-mode'
tsx project.mts setup unixlike-gcc-debug
tsx project.mts config
tsx project.mts build
tsx project.mts test
tsx project.mts pack
```
## More Details

- [Dependency Setup](README_dependencies.md)
- [Building Details](README_building.md)
- [Docker](README_docker.md)

## Testing

See [Catch2 tutorial](https://github.com/catchorg/Catch2/blob/master/docs/tutorial.md)

## Fuzz testing

See [libFuzzer Tutorial](https://github.com/google/fuzzing/blob/master/tutorial/libFuzzerTutorial.md)
