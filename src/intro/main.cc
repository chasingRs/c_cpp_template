#define DBG_MACRO_NO_WARNING
#include <dbg.h>
#include <fmt/core.h>
#include <json/json.h>
#include <spdlog/common.h>
#include <spdlog/spdlog.h>

#include <CLI/CLI.hpp>
#include <cstdlib>
#include <internal_use_only/config.hpp>
#include <iostream>
#include <map>
#include <opencv2/opencv.hpp>
#include <string>

int main( [[maybe_unused]] int argc, [[maybe_unused]] char* argv[] ) {
    spdlog::set_level( spdlog::level::debug );
    spdlog::info( "hello world" );
    spdlog::debug( "hello world" );
    dbg( "hello world" );
    std::cout << cv::getBuildInformation() << std::endl;
    std::map< int, int > myMap;
    CLI::App app{ fmt::format( "{} version {}", c_cpp_template::cmake::project_name,
                               c_cpp_template::cmake::project_version ) };
    bool show_version = false;
    app.add_flag( "-v,--version", show_version, "show version" );
    CLI11_PARSE( app, argc, argv );
    if ( show_version ) {
        std::cout << fmt::format( "{} version {}", app.get_display_name( true ), app.version() ) << "\n";
        return EXIT_SUCCESS;
    }
    return EXIT_SUCCESS;
}
