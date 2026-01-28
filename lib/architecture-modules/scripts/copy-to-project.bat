@echo off
REM 架构模块复制脚本 (Windows版本)
REM 用于将架构模块快速复制到新项目中

setlocal enabledelayedexpansion

REM 检查参数
if "%~1"=="" (
    echo ❌ 请提供目标项目路径
    echo 用法: %0 C:\path\to\your\new\project
    exit /b 1
)

set "TARGET_DIR=%~1"
set "MODULES_DIR=%~dp0.."

echo 🚀 开始复制架构模块...
echo 📁 源目录: %MODULES_DIR%
echo 🎯 目标目录: %TARGET_DIR%

REM 检查目标目录是否存在
if not exist "%TARGET_DIR%" (
    echo ❌ 目标目录不存在: %TARGET_DIR%
    exit /b 1
)

REM 检查目标是否为Node.js项目
if not exist "%TARGET_DIR%\package.json" (
    echo ⚠️  目标目录似乎不是Node.js项目（未找到package.json）
    set /p choice="是否继续？(y/N): "
    if /i not "!choice!"=="y" exit /b 1
)

echo 📋 复制文件...

REM 创建目标lib目录
if not exist "%TARGET_DIR%\lib" mkdir "%TARGET_DIR%\lib"

REM 复制架构模块
if exist "%MODULES_DIR%" (
    xcopy "%MODULES_DIR%" "%TARGET_DIR%\lib\architecture-modules\" /E /I /H /Y >nul
    echo   ✅ 复制架构模块到 lib\architecture-modules\
) else (
    echo ❌ 找不到架构模块目录: %MODULES_DIR%
    exit /b 1
)

REM 复制环境变量示例
if exist "%MODULES_DIR%\.env.example" (
    copy "%MODULES_DIR%\.env.example" "%TARGET_DIR%\" >nul
    echo   ✅ 复制环境变量示例到 .env.example
)

echo.
echo 📦 安装依赖...

REM 进入目标目录安装依赖
cd /d "%TARGET_DIR%"
where npm >nul 2>nul
if %errorlevel% equ 0 (
    npm install
    echo   ✅ 使用npm安装依赖
) else (
    where yarn >nul 2>nul
    if %errorlevel% equ 0 (
        yarn install
        echo   ✅ 使用yarn安装依赖
    ) else (
        echo ⚠️  未找到npm或yarn，请手动安装依赖
    )
)

echo.
echo 📚 下一步操作:
echo 1. 📝 配置环境变量（参考 .env.example）
echo 2. 📖 阅读快速开始: lib\architecture-modules\QUICK_START.md
echo 3. 📖 阅读集成指南: lib\architecture-modules\INTEGRATION_GUIDE.md
echo 4. 🧪 运行快速检查: cd lib\architecture-modules ^& npm run quick-start
echo 5. 🔧 开始集成到你的项目中

echo.
echo 🎉 复制完成！开始你的多地区架构之旅吧！

pause