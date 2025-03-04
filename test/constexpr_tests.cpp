#include <gtest/gtest.h>

#include <c_cpp_template/sample_library.hpp>

TEST( SampleLibraryTest, factorial_constexpr ) {
    static_assert( factorial_constexpr( 0 ) == 1 );
    static_assert( factorial_constexpr( 1 ) == 1 );
    static_assert( factorial_constexpr( 2 ) == 2 );
    static_assert( factorial_constexpr( 3 ) == 6 );
    static_assert( factorial_constexpr( 10 ) == 3628800 );
}
