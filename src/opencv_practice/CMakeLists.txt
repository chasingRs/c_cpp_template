add_executable(opencv_practice main.cc)

find_package(spdlog REQUIRED)
find_package(OpenCV REQUIRED)
find_package(dbg-macro REQUIRED)
find_package(CLI11 REQUIRED)

target_link_libraries(opencv_practice PRIVATE myproject::myproject_options myproject::myproject_warnings)
target_link_system_libraries(
  opencv_practice
  PRIVATE
  spdlog::spdlog
  ${OpenCV_LIBS}
  dbg-macro::dbg-macro
  CLI11::CLI11)

target_include_directories(opencv_practice PRIVATE "${CMAKE_BINARY_DIR}/configured_files/include")
