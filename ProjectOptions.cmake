include(cmake/SystemLink.cmake)
include(CMakeDependentOption)
include(CheckCXXCompilerFlag)
include(cmake/CompilerCheck.cmake)

macro(c_cpp_template_setup_options)
  # NOTE: enable hardening may cause build failed in debug mode
  option(c_cpp_template_ENABLE_HARDENING "Enable hardening" OFF)
  option(c_cpp_template_ENABLE_COVERAGE "Enable coverage reporting" OFF)
  cmake_dependent_option(
    c_cpp_template_ENABLE_GLOBAL_HARDENING
    "Attempt to push hardening options to built dependencies"
    ON
    c_cpp_template_ENABLE_HARDENING
    OFF)

  if(NOT PROJECT_IS_TOP_LEVEL OR c_cpp_template_PACKAGING_MAINTAINER_MODE)
    option(c_cpp_template_ENABLE_IPO "Enable IPO/LTO" OFF)
    option(c_cpp_template_WARNINGS_AS_ERRORS "Treat Warnings As Errors" OFF)
    option(c_cpp_template_ENABLE_USER_LINKER "Enable user-selected linker" OFF)
    option(c_cpp_template_ENABLE_SANITIZER_ADDRESS "Enable address sanitizer" OFF)
    option(c_cpp_template_ENABLE_SANITIZER_LEAK "Enable leak sanitizer" OFF)
    option(c_cpp_template_ENABLE_SANITIZER_UNDEFINED "Enable undefined sanitizer" OFF)
    option(c_cpp_template_ENABLE_SANITIZER_THREAD "Enable thread sanitizer" OFF)
    option(c_cpp_template_ENABLE_SANITIZER_MEMORY "Enable memory sanitizer" OFF)
    option(c_cpp_template_ENABLE_UNITY_BUILD "Enable unity builds" OFF)
    option(c_cpp_template_ENABLE_CLANG_TIDY "Enable clang-tidy" OFF)
    option(c_cpp_template_ENABLE_CPPCHECK "Enable cpp-check analysis" OFF)
    option(c_cpp_template_ENABLE_PCH "Enable precompiled headers" OFF)
    option(c_cpp_template_ENABLE_CACHE "Enable ccache" OFF)
  else()
    option(c_cpp_template_ENABLE_IPO "Enable IPO/LTO" ON)
    option(c_cpp_template_WARNINGS_AS_ERRORS "Treat Warnings As Errors" ON)
    option(c_cpp_template_ENABLE_USER_LINKER "Enable user-selected linker" OFF)
    option(c_cpp_template_ENABLE_SANITIZER_ADDRESS "Enable address sanitizer" OFF)
    option(c_cpp_template_ENABLE_SANITIZER_LEAK "Enable leak sanitizer" OFF)
    option(c_cpp_template_ENABLE_SANITIZER_UNDEFINED "Enable undefined sanitizer" OFF)
    option(c_cpp_template_ENABLE_SANITIZER_THREAD "Enable thread sanitizer" OFF)
    option(c_cpp_template_ENABLE_SANITIZER_MEMORY "Enable memory sanitizer" OFF)
    option(c_cpp_template_ENABLE_UNITY_BUILD "Enable unity builds" OFF)
    option(c_cpp_template_ENABLE_CLANG_TIDY "Enable clang-tidy" ON)
    option(c_cpp_template_ENABLE_CPPCHECK "Enable cpp-check analysis" ON)
    option(c_cpp_template_ENABLE_PCH "Enable precompiled headers" OFF)
    option(c_cpp_template_ENABLE_CACHE "Enable ccache" ON)
  endif()
  if(NOT PROJECT_IS_TOP_LEVEL)
    mark_as_advanced(
      c_cpp_template_ENABLE_IPO
      c_cpp_template_WARNINGS_AS_ERRORS
      c_cpp_template_ENABLE_USER_LINKER
      c_cpp_template_ENABLE_SANITIZER_ADDRESS
      c_cpp_template_ENABLE_SANITIZER_LEAK
      c_cpp_template_ENABLE_SANITIZER_UNDEFINED
      c_cpp_template_ENABLE_SANITIZER_THREAD
      c_cpp_template_ENABLE_SANITIZER_MEMORY
      c_cpp_template_ENABLE_UNITY_BUILD
      c_cpp_template_ENABLE_CLANG_TIDY
      c_cpp_template_ENABLE_CPPCHECK
      c_cpp_template_ENABLE_COVERAGE
      c_cpp_template_ENABLE_PCH
      c_cpp_template_ENABLE_CACHE)
  endif()

  c_cpp_template_check_sanitizer_support("address" SUPPORTS_ASAN)
  c_cpp_template_check_sanitizer_support("memory" SUPPORTS_MSAN)
  c_cpp_template_check_sanitizer_support("undefined" SUPPORTS_UBSAN)
  c_cpp_template_check_sanitizer_support("leak" SUPPORTS_LSAN)
  c_cpp_template_check_sanitizer_support("thread" SUPPORTS_TSAN)
  if(NOT SUPPORTS_ASAN AND c_cpp_template_ENABLE_SANITIZER_ADDRESS)
    message(WARNING "Address sanitizer is not supported. Disabling c_cpp_template_ENABLE_SANITIZER_ADDRESS")
    set(c_cpp_template_ENABLE_SANITIZER_ADDRESS OFF)
  endif()
  if(NOT SUPPORTS_MSAN AND c_cpp_template_ENABLE_SANITIZER_MEMORY)
    message(WARNING "Memory sanitizer is not supported. Disabling c_cpp_template_ENABLE_SANITIZER_MEMORY")
    set(c_cpp_template_ENABLE_SANITIZER_MEMORY OFF)
  endif()
  if(NOT SUPPORTS_UBSAN AND c_cpp_template_ENABLE_SANITIZER_UNDEFINED)
    message(WARNING "Undefined sanitizer is not supported. Disabling c_cpp_template_ENABLE_SANITIZER_UNDEFINED")
    set(c_cpp_template_ENABLE_SANITIZER_UNDEFINED OFF)
  endif()
  if(NOT SUPPORTS_LSAN AND c_cpp_template_ENABLE_SANITIZER_LEAK)
    message(WARNING "Leak sanitizer is not supported. Disabling c_cpp_template_ENABLE_SANITIZER_LEAK")
    set(c_cpp_template_ENABLE_SANITIZER_LEAK OFF)
  endif()
  if(NOT SUPPORTS_TSAN AND c_cpp_template_ENABLE_SANITIZER_THREAD)
    message(WARNING "Thread sanitizer is not supported. Disabling c_cpp_template_ENABLE_SANITIZER_THREAD")
    set(c_cpp_template_ENABLE_SANITIZER_THREAD OFF)
  endif()

  c_cpp_template_check_libfuzzer_support(LIBFUZZER_SUPPORTED)
  if(LIBFUZZER_SUPPORTED
     AND (c_cpp_template_ENABLE_SANITIZER_ADDRESS
          OR c_cpp_template_ENABLE_SANITIZER_THREAD
          OR c_cpp_template_ENABLE_SANITIZER_UNDEFINED))
    set(DEFAULT_FUZZER ON)
  else()
    set(DEFAULT_FUZZER OFF)
  endif()

  option(c_cpp_template_BUILD_FUZZ_TESTS "Enable fuzz testing executable" ${DEFAULT_FUZZER})

endmacro()

macro(c_cpp_template_global_options)
  if(c_cpp_template_ENABLE_IPO)
    include(cmake/InterproceduralOptimization.cmake)
    c_cpp_template_enable_ipo()
  endif()

  if(c_cpp_template_ENABLE_HARDENING AND c_cpp_template_ENABLE_GLOBAL_HARDENING)
    include(cmake/Hardening.cmake)
    if(NOT SUPPORTS_UBSAN
       OR c_cpp_template_ENABLE_SANITIZER_UNDEFINED
       OR c_cpp_template_ENABLE_SANITIZER_ADDRESS
       OR c_cpp_template_ENABLE_SANITIZER_THREAD
       OR c_cpp_template_ENABLE_SANITIZER_LEAK)
      set(ENABLE_UBSAN_MINIMAL_RUNTIME FALSE)
    else()
      set(ENABLE_UBSAN_MINIMAL_RUNTIME TRUE)
    endif()
    message(
      "${c_cpp_template_ENABLE_HARDENING} ${ENABLE_UBSAN_MINIMAL_RUNTIME} ${c_cpp_template_ENABLE_SANITIZER_UNDEFINED}")
    c_cpp_template_enable_hardening(c_cpp_template_options ON ${ENABLE_UBSAN_MINIMAL_RUNTIME})
  endif()
endmacro()

macro(c_cpp_template_local_options)
  if(PROJECT_IS_TOP_LEVEL)
    include(cmake/StandardProjectSettings.cmake)
  endif()

  add_library(c_cpp_template_warnings INTERFACE)
  add_library(c_cpp_template_options INTERFACE)

  include(cmake/CompilerWarnings.cmake)
  c_cpp_template_set_project_warnings(
    c_cpp_template_warnings
    ${c_cpp_template_WARNINGS_AS_ERRORS}
    ""
    ""
    ""
    "")

  if(c_cpp_template_ENABLE_USER_LINKER)
    include(cmake/Linker.cmake)
    c_cpp_template_configure_linker(c_cpp_template_options)
  endif()

  include(cmake/Sanitizers.cmake)
  c_cpp_template_enable_sanitizers(
    c_cpp_template_options
    ${c_cpp_template_ENABLE_SANITIZER_ADDRESS}
    ${c_cpp_template_ENABLE_SANITIZER_LEAK}
    ${c_cpp_template_ENABLE_SANITIZER_UNDEFINED}
    ${c_cpp_template_ENABLE_SANITIZER_THREAD}
    ${c_cpp_template_ENABLE_SANITIZER_MEMORY})

  set_target_properties(c_cpp_template_options PROPERTIES UNITY_BUILD ${c_cpp_template_ENABLE_UNITY_BUILD})

  if(c_cpp_template_ENABLE_PCH)
    target_precompile_headers(
      c_cpp_template_options
      INTERFACE
      <vector>
      <string>
      <utility>)
  endif()

  if(c_cpp_template_ENABLE_CACHE)
    include(cmake/Cache.cmake)
    c_cpp_template_enable_cache()
  endif()

  include(cmake/StaticAnalyzers.cmake)
  if(c_cpp_template_ENABLE_CLANG_TIDY)
    c_cpp_template_enable_clang_tidy(c_cpp_template_options ${c_cpp_template_WARNINGS_AS_ERRORS})
  endif()

  if(c_cpp_template_ENABLE_CPPCHECK)
    c_cpp_template_enable_cppcheck(${c_cpp_template_WARNINGS_AS_ERRORS} "") # override cppcheck options
  endif()

  if(c_cpp_template_ENABLE_COVERAGE)
    include(cmake/Tests.cmake)
    c_cpp_template_enable_coverage(c_cpp_template_options)
  endif()

  if(c_cpp_template_WARNINGS_AS_ERRORS)
    check_cxx_compiler_flag("-Wl,--fatal-warnings" LINKER_FATAL_WARNINGS)
    if(LINKER_FATAL_WARNINGS)
      # This is not working consistently, so disabling for now
      # target_link_options(c_cpp_template_options INTERFACE -Wl,--fatal-warnings)
    endif()
  endif()

  if(c_cpp_template_ENABLE_HARDENING AND NOT c_cpp_template_ENABLE_GLOBAL_HARDENING)
    include(cmake/Hardening.cmake)
    if(NOT SUPPORTS_UBSAN
       OR c_cpp_template_ENABLE_SANITIZER_UNDEFINED
       OR c_cpp_template_ENABLE_SANITIZER_ADDRESS
       OR c_cpp_template_ENABLE_SANITIZER_THREAD
       OR c_cpp_template_ENABLE_SANITIZER_LEAK)
      set(ENABLE_UBSAN_MINIMAL_RUNTIME FALSE)
    else()
      set(ENABLE_UBSAN_MINIMAL_RUNTIME TRUE)
    endif()
    c_cpp_template_enable_hardening(c_cpp_template_options OFF ${ENABLE_UBSAN_MINIMAL_RUNTIME})
  endif()

endmacro()
