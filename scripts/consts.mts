// For Linux

export const linuxPkgsToInstall = {
  apt: ['build-essential', 'cmake', 'ninja-build', 'ccache', 'cppcheck', 'gcovr', 'zlib1g-dev', 'libffi-dev', 'libssl-dev', 'libbz2-dev', 'libreadline-dev', 'libsqlite3-dev',
    'liblzma-dev', 'libncurses-dev', 'tk-dev'],
  // TODO: Not verify the package names for other package managers
  pacman: ['base-devel', 'cmake', 'ninja', 'ccache', 'cppcheck', 'gcovr'],
  yum: ['gcc', 'gcc-c++', 'cmake', 'ninja-build', 'ccache', 'cppcheck', 'gcovr'],
  brew: ['cmake', 'ninja', 'ccache', 'cppcheck', 'gcovr']
}

// For Windows
// ---- MSVC Toolchain Install Path ----
// TODO: Change this to specify MSVC toolchain Install Path 
// WARN: Don't include spaces or special characters in the path
export const MSVCInstallDir = "C:\\MicrosoftVisualStudio"

// ---- Other packages to install -----
export const windowsPkgsToInstall = ['python', 'conan', 'ninja', 'cmake', 'nsis.portable', 'ccache', 'cppcheck', 'opencppcoverage']
