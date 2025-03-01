#!/bin/bash

# This script setup basic tools for running zx scripts
# 1. Installl nodejs and npm(using nvm)
# 2. Install zx and tsx using npm

npm_install_packages() {
	echo "Installing npm packages..."
	npm install -g tsx
	npm install ..
}

# Function to install Node.js and npm using apt (Debian/Ubuntu)
install_node_npm() {
	echo "Installing Node.js and npm..."
	curl -fsSL https://fnm.vercel.app/install | bash
	source ~/.bashrc
	fnm i v22.13.1
	npm_install_packages
}

install_node_npm
npm_install_packages

echo "zx installation completed."

echo "installing build environment..."
source ~/.bashrc

tsx setupEnv.mts
