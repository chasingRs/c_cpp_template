#！/bin/bash
source ~/.bashrc

if [ -z "$1" ]; then
    echo "请提供要执行的文件路径作为参数。"
    exit 1
fi

echo "running: $@"

$@
