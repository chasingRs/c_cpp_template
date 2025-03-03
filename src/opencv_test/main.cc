#include <iostream>
#include <opencv2/core/utility.hpp>
#include <opencv2/opencv.hpp>

int main( [[maybe_unused]] int argc, [[maybe_unused]] char* argv[] ) {
    std::cout << cv::getBuildInformation() << std::endl;
    return 0;
}
