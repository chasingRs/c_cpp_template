# This file is managed by Conan, contents will be overwritten.
# To keep your changes, remove these comment lines, but the plugin won't be able to modify your requirements

from conan import ConanFile
from conan.tools.cmake import CMakeToolchain, cmake_layout


class ConanApplication(ConanFile):
    package_type = "application"
    settings = "os", "compiler", "build_type", "arch"
    generators = "CMakeDeps"

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
        self.requires("gtest/1.15.0")
        self.requires("spdlog/1.15.1")
        self.requires("jsoncpp/1.9.6")
        self.requires("dbg-macro/0.5.1")
        self.requires("opencv/4.11.0")
        self.requires("boost/1.87.0")
        self.requires("cli11/2.4.2")

    def configure(self):
        self.options["opencv"].shared = True
        self.options["opencv"].with_wayland = False
        # Gcc 15.1 have bug with libiconv 1.17, which is used by ffmpeg 4.4.4
        self.options["opencv"].with_ffmpeg = False
