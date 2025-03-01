#!/usr/bin/bash
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

if command -v fnm >/dev/null 2>&1; then
	echo "fnm is already installed."
else
	install_node_npm
fi

npm_install_packages
echo "zx installation completed."

echo "installing build environment..."
source ~/.bashrc

tsx setupEnv.mts
