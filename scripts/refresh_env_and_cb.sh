#！/bin/bash
source ~/.bashrc

if [ -z "$1" ]; then
    echo "Error: please provide the file path to execute"
    exit 1
fi

echo "running: $@"

$@
