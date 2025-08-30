# This file is managed by Conan, contents will be overwritten.
# To keep your changes, remove these comment lines, but the plugin won't be able to modify your requirements

from conan import ConanFile
from conan.tools.cmake import CMakeToolchain, cmake_layout


class ConanApplication(ConanFile):
    package_type = "application"
    settings = "os", "compiler", "build_type", "arch"
    generators = "CMakeDeps"

    options = {
        "build_tests": [True, False],
    }

    default_options = {
        "build_tests": False,
        "opencv/*:shared": True,
    }

    def layout(self):
        cmake_layout(self)

    def generate(self):
        tc = CMakeToolchain(self)
        tc.user_presets_path = False
        tc.generate()

    def requirements(self):
        # requirements = self.conan_data.get("requirements", [])
        # for requirement in requirements:
        #     self.requires(requirement)
        self.requires("gtest/1.17.0")
        self.requires("spdlog/1.15.3")
        self.requires("jsoncpp/1.9.6")
        self.requires("dbg-macro/0.5.1")
        self.requires("opencv/4.12.0")
        self.requires("boost/1.88.0")
        self.requires("cli11/2.5.0")

    def configure(self):
        # Gcc 15.1 have bug with libiconv 1.17, which is used by ffmpeg 4.4.4
        if self.settings.os == "Linux":
            self.options["opencv"].with_wayland = False
            self.options["opencv"].with_ffmpeg = False
