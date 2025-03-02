#include <opencv2/opencv.hpp>

int main( [[maybe_unused]] int argc, [[maybe_unused]] char* argv[] ) {
    cv::Mat img = cv::imread( "test.jpg", cv::IMREAD_COLOR );
    cv::imshow( "image", img );
    cv::waitKey( 0 );
    return 0;
}
