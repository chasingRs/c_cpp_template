#define DBG_MACRO_NO_WARNING
#include <dbg.h>
#include <fmt/core.h>
#include <json/json.h>
#include <spdlog/common.h>
#include <spdlog/spdlog.h>

#include <CLI/CLI.hpp>
#include <cstdlib>
#include <exception>
#include <internal_use_only/config.hpp>
#include <iostream>
#include <map>
#include <queue>
#include <string>
struct Person {
    std::string name;
    int age;
    std::string address;
};

int main( [[maybe_unused]] int argc, [[maybe_unused]] char* argv[] ) {
    spdlog::set_level( spdlog::level::debug );
    spdlog::debug( "hello world" );
    spdlog::info( "hello world" );
    std::cout << "hello world" << "\n";
    std::map< int, int > myMap;
    dbg( "hello world" );
    std::queue< Person > que;
    CLI::App app{ fmt::format( "{} version {}", c_cpp_template::cmake::project_name,
                               c_cpp_template::cmake::project_version ) };
    bool show_version = false;
    try {
        app.add_flag( "-v,--version", show_version, "show version" );

        CLI11_PARSE( app, argc, argv );

        if ( show_version ) {
            std::cout << fmt::format( "{} version {}", app.get_display_name( true ), app.version() ) << "\n";
            return EXIT_SUCCESS;
        }
    }
    catch ( std::exception& e ) {
        std::cerr << e.what() << "\n";
    }
    catch ( ... ) {
        std::cerr << "unhandled exception occurred" << "\n";
    }
    std::cout << app.help() << "\n";
    return EXIT_SUCCESS;
}
