# 先执行 source ~/.bashrc 等效操作
Import-Module "$env:ChocolateyInstall/helpers/chocolateyInstaller.psm1"
refreshenv
# 检查是否提供了参数
if (-not $args) {
    Write-Host "请提供要执行的文件路径作为参数。"
    exit 1
}

Write-Host "running: $args"

# 执行参数中指定的命令
& $args

