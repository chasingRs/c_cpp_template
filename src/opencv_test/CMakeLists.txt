add_executable(opencv_test main.cc)

find_package(OpenCV REQUIRED)

target_link_libraries(opencv_test PRIVATE myproject::myproject_options myproject::myproject_warnings)
target_link_system_libraries(opencv_test PRIVATE opencv::opencv)

target_include_directories(opencv_test PRIVATE "${CMAKE_BINARY_DIR}/configured_files/include")
