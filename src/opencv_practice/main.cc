#include <opencv2/core/cvdef.h>
#include <opencv2/core/hal/interface.h>
#include <spdlog/spdlog.h>

#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <opencv2/core/traits.hpp>
#include <opencv2/core/types.hpp>
#include <opencv2/highgui.hpp>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/opencv.hpp>

using namespace cv;
bool isDrawCircle = false;

uint8_t R = 0;
uint8_t G = 0;
uint8_t B = 0;

void onRChange( int value, void* userdata ) {
    R = static_cast< uint8_t >( value );
    spdlog::info( "R:{}", R );
}
void onGChange( int value, void* userdata ) {
    G = static_cast< uint8_t >( value );
    spdlog::info( "G:{}", R );
}
void onBChange( int value, void* userdata ) {
    B = static_cast< uint8_t >( value );
    spdlog::info( "B:{}", R );
}

void onMouseMove( int event, int x, int y, int flags, void* userdata ) {
    static bool isMousePressed = false;
    static Point startPoint    = { 0, 0 };
    if ( event == MouseEventTypes::EVENT_LBUTTONDOWN ) {
        spdlog::info( "Left button down at ({}, {})", x, y );
        isMousePressed = true;
        startPoint     = { x, y };
    }
    else if ( event == MouseEventTypes::EVENT_LBUTTONUP ) {
        spdlog::info( "Left button up at ({}, {})", x, y );
        isMousePressed = false;
    }
    else if ( event == cv::EVENT_MOUSEMOVE ) {
        if ( isMousePressed ) {
            spdlog::info( "Mouse move at ({}, {})", x, y );
            cv::Mat img = *static_cast< cv::Mat* >( userdata );
            img.setTo( Scalar( 0 ) );
            if ( isDrawCircle ) {
                circle(
                    img, { ( x + startPoint.x ) / 2, ( y + startPoint.y ) / 2 },
                    static_cast< int >( sqrt( pow( ( x - startPoint.x ), 2 ) + pow( ( y - startPoint.y ), 2 ) ) / 2 ),
                    Scalar{ 255, 255, 255 } );
            }
            else {
                rectangle( img, startPoint, { x, y }, { 255, 255, 255 } );
            }
        }
    }
}

int main( [[maybe_unused]] int argc, [[maybe_unused]] char* argv[] ) {
    spdlog::set_level( spdlog::level::debug );
    spdlog::debug( "hello world" );
    spdlog::info( "hello world" );
    spdlog::warn("hello world");

    cv::Mat img = cv::imread( "resources/scene.jpg", cv::IMREAD_GRAYSCALE );
    cv::namedWindow( "img", cv::WINDOW_AUTOSIZE );
    cv::imshow( "img", img );

    cv::Mat img2( cv::Size( 512, 512 ), CV_8UC1 );
    img2.setTo( cv::Scalar( 0 ) );
    cv::namedWindow( "img2" );
    cv::namedWindow( "trackerWindow" );
    cv::imshow( "img", img );
    cv::setMouseCallback( "img2", onMouseMove, static_cast< void* >( &img2 ) );

    createTrackbar( "R", "img", nullptr, 255, onRChange );
    createTrackbar( "G", "img", nullptr, 255, onGChange );
    createTrackbar( "B", "img", nullptr, 255, onBChange );
    waitKey( 0 );

    while ( true ) {
        // press <esc> to exit
        auto key = waitKey( 1 );
        switch ( key ) {
        case 27:
            return EXIT_SUCCESS;
        case 'm':
            isDrawCircle = !isDrawCircle;
            break;
        default:
            break;
        }
        cv::imshow( "img2", img2 );
    }
    spdlog::info( "tracker value:{}", R );
    return EXIT_SUCCESS;
}
