# Set a default build type if none was specified
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  message(STATUS "Setting build type to 'RelWithDebInfo' as none was specified.")
  set(CMAKE_BUILD_TYPE
      RelWithDebInfo
      CACHE STRING "Choose the type of build." FORCE)
  # Set the possible values of build type for cmake-gui, ccmake
  set_property(
    CACHE CMAKE_BUILD_TYPE
    PROPERTY STRINGS
             "Debug"
             "Release"
             "MinSizeRel"
             "RelWithDebInfo")
endif()

# Generate compile_commands.json to make it easier to work with clang based tools
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Set output directories
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

# Add $ORIGIN to rpath so that we can run executables from the build directory
# set(CMAKE_SKIP_INSTALL_RPATH TRUE)
# set(CMAKE_SKIP_BUILD_RPATH TRUE)
set(CMAKE_BUILD_WITH_INSTALL_RPATH TRUE)
set(CMAKE_INSTALL_RPATH $ORIGIN:$ORIGIN/../lib)
# Force to set 'rpath' instead of 'runpath', to fix some shared library in path
# but the program complains they are not found as these shared library relay on other shared library
# see https://segmentfault.com/a/1190000044513658 , rpath vs runpath
# TODO: Dont't know if this is the best way to do it
if((CMAKE_CXX_COMPILER_ID STREQUAL "GNU" OR CMAKE_CXX_COMPILER_ID STREQUAL "Clang") AND CMAKE_SYSTEM_NAME STREQUAL
                                                                                        "Linux")
  set(CMAKE_SHARED_LINKER_FLAGS "${CMAKE_SHARED_LINKER_FLAGS} -Wl,--disable-new-dtags")
  set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -Wl,--disable-new-dtags")
endif()

# Enhance error reporting and compiler messages
if(CMAKE_CXX_COMPILER_ID MATCHES ".*Clang")
  if(WIN32)
    # On Windows cuda nvcc uses cl and not clang
    add_compile_options($<$<COMPILE_LANGUAGE:C>:-fcolor-diagnostics> $<$<COMPILE_LANGUAGE:CXX>:-fcolor-diagnostics>)
  else()
    add_compile_options(-fcolor-diagnostics)
  endif()
elseif(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
  if(WIN32)
    # On Windows cuda nvcc uses cl and not gcc
    add_compile_options($<$<COMPILE_LANGUAGE:C>:-fdiagnostics-color=always>
                        $<$<COMPILE_LANGUAGE:CXX>:-fdiagnostics-color=always>)
  else()
    add_compile_options(-fdiagnostics-color=always -fdiagnostics-show-template-tree)
  endif()
elseif(CMAKE_CXX_COMPILER_ID STREQUAL "MSVC")
  # Set encoding to UTF-8 to prevent MSVC from using the system code page
  add_compile_options("$<$<C_COMPILER_ID:MSVC>:/utf-8>")
  add_compile_options("$<$<CXX_COMPILER_ID:MSVC>:/utf-8>")
  if(MSVC_VERSION GREATER 1900)
    add_compile_options(/diagnostics:column)
  else()
    message(STATUS "No colored compiler diagnostic set for '${CMAKE_CXX_COMPILER_ID}' compiler.")
  endif()
endif()
