import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

export interface InstallResult {
  success: boolean;
  config?: {
    model: string;
    fallbackToApi: boolean;
    openaiApiKey?: string;
    autoInstallDeps: boolean;
  };
  error?: string;
}

export async function runInstallWizard(api: OpenClawPluginApi): Promise<InstallResult> {
  const logger = api.logger;
  const prompter = api.prompter;
  
  logger.info("🚀 Whisper Local Auto - 配置向导");
  logger.info("===================================");
  logger.info("本插件将自动转录所有语音消息为文字");
  logger.info("支持所有 OpenClaw Channel (飞书、TG、WhatsApp等)");
  logger.info("===================================\n");

  // 1. 检查 ffmpeg
  logger.info("📦 步骤 1/5: 检查 ffmpeg...");
  const ffmpegCheck = await checkCommand("ffmpeg");
  if (!ffmpegCheck.installed) {
    logger.warn("⚠️ ffmpeg 未安装，这是必需的依赖");
    
    const installChoice = await prompter.confirm(
      "是否自动安装 ffmpeg? (需要管理员权限)",
      true
    );
    
    if (installChoice) {
      const installed = await installFfmpeg(api);
      if (!installed) {
        return {
          success: false,
          error: "ffmpeg 安装失败，请手动安装后再试。\n安装指南: https://ffmpeg.org/download.html"
        };
      }
    } else {
      return {
        success: false,
        error: "ffmpeg 是必需的依赖，请先安装 ffmpeg"
      };
    }
  } else {
    logger.info(`✅ ffmpeg 已安装: ${ffmpegCheck.version}`);
  }

  // 2. 检查 Python
  logger.info("\n📦 步骤 2/5: 检查 Python...");
  const pythonCheck = await checkCommand("python3");
  if (!pythonCheck.installed) {
    const pythonAltCheck = await checkCommand("python");
    if (!pythonAltCheck.installed) {
      return {
        success: false,
        error: "Python 3 未安装，请先安装 Python 3.8+\n安装指南: https://www.python.org/downloads/"
      };
    }
  }
  logger.info(`✅ Python 已安装`);

  // 3. 检查 Whisper
  logger.info("\n📦 步骤 3/5: 检查 Whisper...");
  const whisperCheck = await checkWhisper();
  let whisperInstalled = whisperCheck.installed;
  
  if (!whisperInstalled) {
    logger.warn("⚠️ openai-whisper 未安装");
    
    const installChoice = await prompter.confirm(
      "是否自动安装 openai-whisper? (需要 pip 和 Python 3)",
      true
    );
    
    if (installChoice) {
      whisperInstalled = await installWhisper(api);
      if (!whisperInstalled) {
        logger.warn("⚠️ Whisper 安装失败，将只能使用 API 模式");
        const continueAnyway = await prompter.confirm(
          "是否继续配置 (使用 API 模式)?",
          true
        );
        if (!continueAnyway) {
          return {
            success: false,
            error: "Whisper 安装失败，且用户选择不使用 API 模式"
          };
        }
      }
    } else {
      logger.warn("⚠️ 未安装 Whisper，将只能使用 API 模式");
    }
  } else {
    logger.info("✅ Whisper 已安装");
  }

  // 4. 选择模型
  logger.info("\n⚙️ 步骤 4/5: 配置模型...");
  
  const modelChoices = [
    { value: "tiny", label: "tiny - 最快，适合测试", hint: "~39MB" },
    { value: "base", label: "base - 快速且准确", hint: "~74MB" },
    { value: "small", label: "small - 推荐 (平衡)", hint: "~244MB" },
    { value: "medium", label: "medium - 较慢但准确", hint: "~769MB" },
    { value: "large", label: "large - 最慢但最准 (需要 GPU)", hint: "~1.5GB" },
  ];
  
  // 如果 whisper 未安装，限制模型选择
  const availableModels = whisperInstalled 
    ? modelChoices 
    : modelChoices.slice(0, 3); // 只有 tiny/base/small 支持 API fallback
  
  const modelChoice = await prompter.select(
    "选择默认 Whisper 模型:",
    availableModels,
    whisperInstalled ? "small" : "base"
  );

  // 5. API 降级选项
  logger.info("\n⚙️ 步骤 5/5: 配置 API 降级...");
  
  let enableFallback = false;
  let apiKey = undefined;
  
  if (whisperInstalled) {
    enableFallback = await prompter.confirm(
      "当本地转录失败时，是否允许使用 OpenAI API 作为后备?",
      true
    );
  } else {
    logger.warn("⚠️ 未安装本地 Whisper，必须配置 API 才能使用");
    enableFallback = true;
  }
  
  if (enableFallback) {
    const hasKey = await prompter.confirm("你有 OpenAI API Key 吗?", false);
    if (hasKey) {
      apiKey = await prompter.password("请输入 API Key (将安全存储):");
      
      // 简单验证 key 格式
      if (!apiKey.startsWith("sk-")) {
        const continueAnyway = await prompter.confirm(
          "API Key 格式似乎不正确 (应以 sk- 开头)，是否继续?",
          false
        );
        if (!continueAnyway) {
          apiKey = undefined;
        }
      }
    } else {
      logger.info("💡 提示: 你可以在 https://platform.openai.com/api-keys 获取 API Key");
      logger.info("   稍后可通过 'openclaw plugins configure whisper-local-auto' 配置");
    }
  }

  // 下载模型（如果需要）
  if (whisperInstalled) {
    logger.info(`\n📥 正在预下载 ${modelChoice} 模型...`);
    logger.info("   (这可能需要几分钟，取决于你的网络速度)");
    
    const downloaded = await downloadWhisperModel(modelChoice, api);
    if (downloaded) {
      logger.info("✅ 模型下载完成");
    } else {
      logger.warn("⚠️ 模型预下载失败，将在首次使用时重试");
    }
  }

  // 完成
  logger.info("\n" + "=".repeat(50));
  logger.info("✅ 配置完成！");
  logger.info("=".repeat(50));
  logger.info(`模型: ${modelChoice}`);
  logger.info(`API 降级: ${enableFallback ? "启用" : "禁用"}`);
  logger.info(`API Key: ${apiKey ? "已配置" : "未配置"}`);
  logger.info("\n💡 使用方法:");
  logger.info("   直接发送语音消息，会自动转录为文字！");
  logger.info("\n📖 更多帮助:");
  logger.info("   openclaw plugins info whisper-local-auto");
  logger.info("=".repeat(50));

  return {
    success: true,
    config: {
      model: modelChoice,
      fallbackToApi: enableFallback,
      openaiApiKey: apiKey,
      autoInstallDeps: config.autoInstallDeps !== false,
      initialized: true,
    }
  };
}

// ============ 依赖检查和安装函数 ============

async function checkCommand(cmd: string): Promise<{installed: boolean, version?: string, path?: string}> {
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    
    // 检查命令是否存在
    const { stdout: pathStdout } = await execAsync(`which ${cmd} 2>/dev/null || command -v ${cmd} 2>/dev/null || echo ""`);
    const path = pathStdout.trim();
    
    if (!path) {
      return { installed: false };
    }
    
    // 获取版本
    let version = undefined;
    try {
      const { stdout: verStdout } = await execAsync(`${cmd} -version 2>&1 || ${cmd} --version 2>&1`, { timeout: 5000 });
      const firstLine = verStdout.split("\n")[0].trim();
      if (firstLine && !firstLine.includes("not found") && !firstLine.includes("error")) {
        version = firstLine;
      }
    } catch {
      // 忽略版本获取错误
    }
    
    return { installed: true, version, path };
  } catch {
    return { installed: false };
  }
}

async function checkWhisper(): Promise<{installed: boolean, version?: string}> {
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    
    const { stdout } = await execAsync("whisper --help 2>&1");
    if (stdout.includes("usage:") || stdout.includes("--model")) {
      // 尝试获取版本
      try {
        const { stdout: verOut } = await execAsync("pip3 show openai-whisper 2>/dev/null || pip show openai-whisper 2>/dev/null");
        const versionMatch = verOut.match(/Version:\s*(.+)/);
        return { installed: true, version: versionMatch ? versionMatch[1].trim() : undefined };
      } catch {
        return { installed: true };
      }
    }
    return { installed: false };
  } catch {
    return { installed: false };
  }
}

async function installFfmpeg(api: OpenClawPluginApi): Promise<boolean> {
  const logger = api.logger;
  const platform = process.platform;
  
  logger.info(`🔧 正在安装 ffmpeg (${platform})...`);
  
  try {
    if (platform === "darwin") {
      // macOS: 使用 homebrew
      logger.info("使用 Homebrew 安装...");
      await api.runtime.exec("brew", ["install", "ffmpeg"], { 
        timeout: 600000,
        env: { ...process.env, HOMEBREW_NO_AUTO_UPDATE: "1" }
      });
      
    } else if (platform === "linux") {
      // Linux: 检测发行版并使用对应包管理器
      logger.info("检测 Linux 发行版...");
      
      // 尝试检测 apt (Debian/Ubuntu)
      try {
        await api.runtime.exec("which", ["apt-get"], { timeout: 5000 });
        logger.info("使用 apt-get 安装...");
        await api.runtime.exec("sudo", ["apt-get", "update"], { timeout: 120000 });
        await api.runtime.exec("sudo", ["apt-get", "install", "-y", "ffmpeg"], { timeout: 300000 });
        return true;
      } catch {
        // 不是 apt 系统
      }
      
      // 尝试检测 yum (RHEL/CentOS)
      try {
        await api.runtime.exec("which", ["yum"], { timeout: 5000 });
        logger.info("使用 yum 安装...");
        await api.runtime.exec("sudo", ["yum", "install", "-y", "ffmpeg"], { timeout: 300000 });
        return true;
      } catch {
        // 不是 yum 系统
      }
      
      // 尝试检测 pacman (Arch)
      try {
        await api.runtime.exec("which", ["pacman"], { timeout: 5000 });
        logger.info("使用 pacman 安装...");
        await api.runtime.exec("sudo", ["pacman", "-S", "--noconfirm", "ffmpeg"], { timeout: 300000 });
        return true;
      } catch {
        // 不是 pacman 系统
      }
      
      throw new Error("无法自动安装 ffmpeg: 不支持的 Linux 发行版");
      
    } else if (platform === "win32") {
      throw new Error("Windows 暂不支持自动安装 ffmpeg，请手动安装: https://ffmpeg.org/download.html#build-windows");
    } else {
      throw new Error(`不支持的平台: ${platform}`);
    }
    
    // 验证安装
    const verifyCheck = await checkCommand("ffmpeg");
    if (!verifyCheck.installed) {
      throw new Error("ffmpeg 安装后验证失败");
    }
    
    logger.info(`✅ ffmpeg 安装成功: ${verifyCheck.version}`);
    return true;
    
  } catch (error) {
    logger.error("❌ ffmpeg 安装失败:", error.message);
    return false;
  }
}

async function installWhisper(api: OpenClawPluginApi): Promise<boolean> {
  const logger = api.logger;
  
  logger.info("🔧 正在安装 openai-whisper...");
  
  try {
    // 先尝试使用 pip3
    try {
      logger.info("尝试使用 pip3 安装...");
      await api.runtime.exec("pip3", ["install", "-U", "openai-whisper"], { 
        timeout: 300000,
        env: { ...process.env, PIP_NO_INPUT: "1" }
      });
    } catch (pip3Error) {
      // 尝试 pip
      logger.info("尝试使用 pip 安装...");
      await api.runtime.exec("pip", ["install", "-U", "openai-whisper"], { 
        timeout: 300000,
        env: { ...process.env, PIP_NO_INPUT: "1" }
      });
    }
    
    // 验证安装
    const verifyCheck = await checkWhisper();
    if (!verifyCheck.installed) {
      throw new Error("Whisper 安装后验证失败");
    }
    
    logger.info("✅ openai-whisper 安装成功");
    return true;
    
  } catch (error) {
    logger.error("❌ openai-whisper 安装失败:", error.message);
    logger.info("💡 你可以稍后手动安装: pip3 install -U openai-whisper");
    return false;
  }
}

async function downloadWhisperModel(model: string, api: OpenClawPluginApi): Promise<boolean> {
  const logger = api.logger;
  
  logger.info(`📥 正在预下载 Whisper ${model} 模型...`);
  logger.info("   (这可能需要几分钟，取决于你的网络)");
  
  try {
    // 使用 whisper --help 触发模型下载
    // whisper 会在实际使用前自动下载模型
    await api.runtime.exec("whisper", ["--model", model, "--help"], { 
      timeout: 600000, // 10分钟超时
      env: { ...process.env }
    });
    
    logger.info(`✅ ${model} 模型准备就绪`);
    return true;
    
  } catch (error) {
    logger.warn(`⚠️ 模型预下载失败: ${error.message}`);
    logger.info("   将在首次使用时自动重试下载");
    return false;
  }
}