#include <gtest/gtest.h>

#include <c_cpp_template/sample_library.hpp>

TEST( HelloTest, BasicAssertions ) {
    EXPECT_STRNE( "hello", "world" );
}

TEST( SampleLibraryTest, FactorialTest ) {
    EXPECT_EQ( 1, factorial( 0 ) );
    EXPECT_EQ( 1, factorial( 1 ) );
    EXPECT_EQ( 2, factorial( 2 ) );
    EXPECT_EQ( 6, factorial( 3 ) );
    EXPECT_EQ( 24, factorial( 4 ) );
    EXPECT_EQ( 120, factorial( 5 ) );
}
