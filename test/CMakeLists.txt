cmake_minimum_required(VERSION 3.15...3.23)

project(CmakeConfigPackageTests LANGUAGES CXX)

# ---- Test as standalone project the exported config package ----

if(PROJECT_IS_TOP_LEVEL OR TEST_INSTALLED_VERSION)
  enable_testing()

  find_package(c_cpp_template CONFIG REQUIRED) # for intro, project_options, ...

  if(NOT TARGET c_cpp_template_options)
    message(FATAL_ERROR "Required config package not found!")
    return() # be strictly paranoid for Template Janitor github action! CK
  endif()
endif()

# ---- Dependencies ----
find_package(GTest REQUIRED)
include(GoogleTest)

# Provide a simple smoke test to make sure that the CLI works and can display a --help message
add_test(NAME cli.has_help COMMAND intro --help)
add_test(NAME cli.show_help_without_args COMMAND intro)

# Provide a test to verify that the version being reported from the application matches the version
# given to CMake. This will be important once you package your program. Real world shows that this
# is the kind of simple mistake that is easy to make, but also easy to test for.
add_test(NAME cli.version_matches COMMAND intro --version)
set_tests_properties(cli.version_matches PROPERTIES PASS_REGULAR_EXPRESSION "${PROJECT_VERSION}")

add_executable(tests tests.cpp)
target_link_libraries(
  tests
  PRIVATE c_cpp_template::c_cpp_template_options
          c_cpp_template::c_cpp_template_warnings
          gtest::gtest
          c_cpp_template::sample_library)

add_executable(constexpr_tests constexpr_tests.cpp)
target_link_libraries(
  constexpr_tests
  PRIVATE c_cpp_template::c_cpp_template_options
          c_cpp_template::c_cpp_template_warnings
          gtest::gtest
          c_cpp_template::sample_library)

if(NOT CMAKE_CROSSCOMPILING)
  # Only when not cross-compiling, we can use gtest_discover_tests
  # to automatically discover and register tests to ctest.
  gtest_discover_tests(tests)
  gtest_discover_tests(constexpr_tests)
endif()
