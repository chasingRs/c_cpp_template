# Uses ycm (permissive BSD-3-Clause license) and ForwardArguments (permissive MIT license)

function(c_cpp_template_package_project)
  cmake_policy(SET CMP0103 NEW) # disallow multiple calls with the same NAME

  set(_options ARCH_INDEPENDENT # default to false
  )
  set(_oneValueArgs
      # default to the project_name:
      NAME
      COMPONENT
      # default to project version:
      VERSION
      # default to semver
      COMPATIBILITY
      # default to ${CMAKE_BINARY_DIR}
      CONFIG_EXPORT_DESTINATION
      # default to ${CMAKE_INSTALL_PREFIX}/${CMAKE_INSTALL_DATADIR}/${NAME} suitable for vcpkg, etc.
      CONFIG_INSTALL_DESTINATION)
  set(_multiValueArgs
      # recursively found for the current folder if not specified
      TARGETS
      # a list of public/interface include directories or files
      PUBLIC_INCLUDES
      # the names of the INTERFACE/PUBLIC dependencies that are found using `CONFIG`
      PUBLIC_DEPENDENCIES_CONFIGURED
      # the INTERFACE/PUBLIC dependencies that are found by any means using `find_dependency`. the
      # arguments must be specified within double quotes (e.g. "<dependency> 1.0.0 EXACT" or
      # "<dependency> CONFIG").
      PUBLIC_DEPENDENCIES
      # the names of the PRIVATE dependencies that are found using `CONFIG`. Only included when
      # BUILD_SHARED_LIBS is OFF.
      PRIVATE_DEPENDENCIES_CONFIGURED
      # PRIVATE dependencies that are only included when BUILD_SHARED_LIBS is OFF
      PRIVATE_DEPENDENCIES)

  cmake_parse_arguments(
    _PackageProject
    "${_options}"
    "${_oneValueArgs}"
    "${_multiValueArgs}"
    "${ARGN}")

  # Set default options
  include(GNUInstallDirs) # Define GNU standard installation directories such as
                          # CMAKE_INSTALL_DATADIR

  # set default packaged targets
  if(NOT _PackageProject_TARGETS)
    get_all_installable_targets(_PackageProject_TARGETS)
    message(STATUS "package_project: considering ${_PackageProject_TARGETS} as the exported targets")
  endif()

  # default to the name of the project or the given name
  if("${_PackageProject_NAME}" STREQUAL "")
    set(_PackageProject_NAME ${PROJECT_NAME})
  endif()
  # ycm args
  set(_PackageProject_NAMESPACE "${_PackageProject_NAME}::")
  set(_PackageProject_VARS_PREFIX ${_PackageProject_NAME})
  set(_PackageProject_EXPORT ${_PackageProject_NAME})

  # default version to the project version
  if("${_PackageProject_VERSION}" STREQUAL "")
    set(_PackageProject_VERSION ${PROJECT_VERSION})
  endif()

  # default compatibility to SameMajorVersion
  if("${_PackageProject_COMPATIBILITY}" STREQUAL "")
    set(_PackageProject_COMPATIBILITY "SameMajorVersion")
  endif()

  # default to the build directory
  if("${_PackageProject_CONFIG_EXPORT_DESTINATION}" STREQUAL "")
    set(_PackageProject_CONFIG_EXPORT_DESTINATION "${CMAKE_BINARY_DIR}")
  endif()
  set(_PackageProject_EXPORT_DESTINATION "${_PackageProject_CONFIG_EXPORT_DESTINATION}")

  # use datadir (works better with vcpkg, etc)
  if("${_PackageProject_CONFIG_INSTALL_DESTINATION}" STREQUAL "")
    set(_PackageProject_CONFIG_INSTALL_DESTINATION "${CMAKE_INSTALL_DATADIR}/${_PackageProject_NAME}")
  endif()
  # ycm args
  set(_PackageProject_INSTALL_DESTINATION "${_PackageProject_CONFIG_INSTALL_DESTINATION}")

  # Installation of the public/interface includes
  if(NOT
     "${_PackageProject_PUBLIC_INCLUDES}"
     STREQUAL
     "")
    foreach(_INC ${_PackageProject_PUBLIC_INCLUDES})
      # make include absolute
      if(NOT IS_ABSOLUTE ${_INC})
        set(_INC "${CMAKE_CURRENT_SOURCE_DIR}/${_INC}")
      endif()
      # install include
      if(IS_DIRECTORY ${_INC})
        # the include directories are directly installed to the install destination. If you want an
        # `include` folder in the install destination, name your include directory as `include` (or
        # install it manually using `install()` command).
        install(DIRECTORY ${_INC} DESTINATION "./")
      else()
        install(FILES ${_INC} DESTINATION "${CMAKE_INSTALL_INCLUDEDIR}")
      endif()
    endforeach()
  endif()

  # Append the configured public dependencies
  if(NOT
     "${_PackageProject_PUBLIC_DEPENDENCIES_CONFIGURED}"
     STREQUAL
     "")
    set(_PUBLIC_DEPENDENCIES_CONFIG)
    foreach(DEP ${_PackageProject_PUBLIC_DEPENDENCIES_CONFIGURED})
      list(APPEND _PUBLIC_DEPENDENCIES_CONFIG "${DEP} CONFIG")
    endforeach()
  endif()
  list(APPEND _PackageProject_PUBLIC_DEPENDENCIES ${_PUBLIC_DEPENDENCIES_CONFIG})
  # ycm arg
  set(_PackageProject_DEPENDENCIES ${_PackageProject_PUBLIC_DEPENDENCIES})

  # Append the configured private dependencies
  if(NOT
     "${_PackageProject_PRIVATE_DEPENDENCIES_CONFIGURED}"
     STREQUAL
     "")
    set(_PRIVATE_DEPENDENCIES_CONFIG)
    foreach(DEP ${_PackageProject_PRIVATE_DEPENDENCIES_CONFIGURED})
      list(APPEND _PRIVATE_DEPENDENCIES_CONFIG "${DEP} CONFIG")
    endforeach()
  endif()
  # ycm arg
  list(APPEND _PackageProject_PRIVATE_DEPENDENCIES ${_PRIVATE_DEPENDENCIES_CONFIG})

  # Installation of package (compatible with vcpkg, etc)
  install(
    TARGETS ${_PackageProject_TARGETS}
    EXPORT ${_PackageProject_EXPORT}
    LIBRARY DESTINATION "${CMAKE_INSTALL_LIBDIR}" COMPONENT shlib
    ARCHIVE DESTINATION "${CMAKE_INSTALL_LIBDIR}" COMPONENT lib
    RUNTIME DESTINATION "${CMAKE_INSTALL_BINDIR}" COMPONENT bin
    PUBLIC_HEADER DESTINATION "${CMAKE_INSTALL_INCLUDEDIR}/${_PackageProject_NAME}" COMPONENT dev)

  include("${CMAKE_BINARY_DIR}/conan/build/${CMAKE_BUILD_TYPE}/generators/conan_toolchain.cmake")

  install(
    IMPORTED_RUNTIME_ARTIFACTS
    ${_PackageProject_TARGETS}
    RUNTIME_DEPENDENCY_SET
    runtime_dependency_set
    RUNTIME)
  install(
    RUNTIME_DEPENDENCY_SET
    runtime_dependency_set
    PRE_EXCLUDE_REGEXES
    [[api-ms-win-.*]]
    [[ext-ms-.*]]
    [[kernel32\.dll]]
    [[libc\.so\..*]]
    [[libgcc_s\.so\..*]]
    [[libm\.so\..*]]
    [[libstdc\+\+\.so\..*]]
    POST_EXCLUDE_REGEXES
    # see https://discourse.cmake.org/t/migration-experiences-comparison-runtime-dependency-set-vs-fixup-bundle-bundleutilities/11323/5
    [[.*(\\|/)system32(\\|/).*.dll]]
    [[.*(\\|/)syswow64(\\|/).*.dll]]
    # [[^/lib.*]]
    # [[^/usr/lib.*]]
    DIRECTORIES
    ${CONAN_RUNTIME_LIB_DIRS}
    $ENV{PATH}) # Mainly for windows msvc, some dlls are not in the runtime lib dirs, but in the PATH
  set(_targets_str "")
  foreach(_target ${_PackageProject_TARGETS})
    set(_targets_str "${_targets_str} ${_PackageProject_NAMESPACE}${_target}")
  endforeach()
  set(USAGE_FILE_CONTENT
      "The package ${_PackageProject_NAME} provides CMake targets:

    find_package(${_PackageProject_NAME} CONFIG REQUIRED)
    target_link_libraries(main PRIVATE ${_targets_str})
  ")
  install(CODE "MESSAGE(STATUS \"${USAGE_FILE_CONTENT}\")")
  file(WRITE "${_PackageProject_EXPORT_DESTINATION}/usage" "${USAGE_FILE_CONTENT}")
  install(FILES "${_PackageProject_EXPORT_DESTINATION}/usage"
          DESTINATION "${_PackageProject_CONFIG_INSTALL_DESTINATION}")

  unset(_PackageProject_TARGETS)

  # From https://github.com/polysquare/cmake-forward-arguments
  include("${CMAKE_CURRENT_LIST_DIR}/cmake/ForwardArguments.cmake")

  # prepare the forward arguments for ycm
  set(_FARGS_LIST)
  cmake_forward_arguments(
    _PackageProject
    _FARGS_LIST
    OPTION_ARGS
    "${_options};"
    SINGLEVAR_ARGS
    "${_oneValueArgs};EXPORT_DESTINATION;INSTALL_DESTINATION;NAMESPACE;VARS_PREFIX;EXPORT"
    MULTIVAR_ARGS
    "${_multiValueArgs};DEPENDENCIES;PRIVATE_DEPENDENCIES")

  # Set the CMP0135 policy
  if(POLICY CMP0135)
    cmake_policy(SET CMP0135 NEW)
  endif()

  include(FetchContent)

  # download ycm
  FetchContent_Declare(
    _ycm
    URL https://github.com/robotology/ycm-cmake-modules/releases/download/v0.16.5/ycm-cmake-modules-0.16.5-all.tar.gz)
  FetchContent_MakeAvailable(_ycm)
  include("${_ycm_SOURCE_DIR}/share/YCM/modules/InstallBasicPackageFiles.cmake")

  install_basic_package_files(${_PackageProject_NAME} "${_FARGS_LIST}")

  include("${_ycm_SOURCE_DIR}/share/YCM/modules/AddUninstallTarget.cmake")
endfunction()
