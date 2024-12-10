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
	curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.9/install.sh | bash
	source load_env.sh
	nvm install --lts
	npm_install_packages
}

install_node_npm
npm_install_packages

echo "zx installation completed."

echo "installing build environment..."
source ~/.bashrc

tsx setupEnv.mts
