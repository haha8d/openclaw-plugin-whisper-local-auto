import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface HealthCheckResult {
  healthy: boolean;
  issues: HealthIssue[];
  details: {
    ffmpeg?: { installed: boolean; version?: string; path?: string };
    python?: { installed: boolean; version?: string };
    whisper?: { installed: boolean; version?: string };
    models?: { [key: string]: boolean };
  };
}

export interface HealthIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  autoFixable: boolean;
  fixCommand?: string;
}

export async function runHealthCheck(api: OpenClawPluginApi): Promise<HealthCheckResult> {
  const logger = api.logger;
  const issues: HealthIssue[] = [];
  const details: HealthCheckResult["details"] = {};

  logger.debug("开始健康检查...");

  // 1. 检查 ffmpeg
  const ffmpegCheck = await checkFfmpeg();
  details.ffmpeg = ffmpegCheck;
  
  if (!ffmpegCheck.installed) {
    issues.push({
      severity: "error",
      code: "FFMPEG_MISSING",
      message: "ffmpeg 未安装，这是必需的依赖",
      autoFixable: true,
      fixCommand: "brew install ffmpeg (macOS) 或 sudo apt-get install ffmpeg (Linux)"
    });
  } else {
    logger.debug(`ffmpeg 已安装: ${ffmpegCheck.version}`);
  }

  // 2. 检查 Python
  const pythonCheck = await checkPython();
  details.python = pythonCheck;
  
  if (!pythonCheck.installed) {
    issues.push({
      severity: "error",
      code: "PYTHON_MISSING",
      message: "Python 3 未安装，这是必需的依赖",
      autoFixable: false,
      fixCommand: "请从 https://www.python.org/downloads/ 安装 Python 3.8+"
    });
  } else {
    logger.debug(`Python 已安装: ${pythonCheck.version}`);
    
    // 检查 Python 版本
    const versionMatch = pythonCheck.version?.match(/Python (\d+)\.(\d+)/);
    if (versionMatch) {
      const major = parseInt(versionMatch[1]);
      const minor = parseInt(versionMatch[2]);
      if (major < 3 || (major === 3 && minor < 8)) {
        issues.push({
          severity: "warning",
          code: "PYTHON_VERSION_OLD",
          message: `Python 版本 ${major}.${minor} 较旧，建议升级到 3.8+`,
          autoFixable: false
        });
      }
    }
  }

  // 3. 检查 Whisper
  const whisperCheck = await checkWhisper();
  details.whisper = whisperCheck;
  
  if (!whisperCheck.installed) {
    issues.push({
      severity: "warning",
      code: "WHISPER_MISSING",
      message: "openai-whisper 未安装，只能使用 API 模式",
      autoFixable: true,
      fixCommand: "pip3 install -U openai-whisper"
    });
  } else {
    logger.debug(`Whisper 已安装: ${whisperCheck.version}`);
  }

  // 4. 检查模型（仅当 whisper 安装时）
  if (whisperCheck.installed) {
    const config = api.config.get("whisper-local-auto") || {};
    const model = config.model || "small";
    details.models = { [model]: false };
    
    try {
      // 检查模型是否已下载
      const { stdout } = await execAsync(`whisper --model ${model} --help 2>&1 || echo "NEED_DOWNLOAD"`, { timeout: 30000 });
      if (!stdout.includes("NEED_DOWNLOAD") && !stdout.includes("download")) {
        details.models[model] = true;
        logger.debug(`模型 ${model} 已下载`);
      } else {
        issues.push({
          severity: "info",
          code: "MODEL_NOT_DOWNLOADED",
          message: `Whisper ${model} 模型尚未下载，将在首次使用时自动下载`,
          autoFixable: false
        });
      }
    } catch (error) {
      // 忽略检查错误
    }
  }

  const healthy = !issues.some(i => i.severity === "error");
  
  return {
    healthy,
    issues,
    details
  };
}

export async function autoFixIssues(api: OpenClawPluginApi, issues: HealthIssue[]): Promise<{success: boolean; manualSteps?: string[]}> {
  const logger = api.logger;
  const manualSteps: string[] = [];
  
  for (const issue of issues) {
    if (!issue.autoFixable) {
      manualSteps.push(`${issue.code}: ${issue.message}`);
      continue;
    }
    
    logger.info(`🔧 尝试自动修复: ${issue.code}`);
    
    try {
      switch (issue.code) {
        case "FFMPEG_MISSING":
          const platform = process.platform;
          if (platform === "darwin") {
            await api.runtime.exec("brew", ["install", "ffmpeg"], { timeout: 600000 });
          } else if (platform === "linux") {
            // 检测发行版
            try {
              await api.runtime.exec("apt-get", ["--version"], { timeout: 5000 });
              await api.runtime.exec("sudo", ["apt-get", "update"], { timeout: 120000 });
              await api.runtime.exec("sudo", ["apt-get", "install", "-y", "ffmpeg"], { timeout: 300000 });
            } catch {
              try {
                await api.runtime.exec("yum", ["--version"], { timeout: 5000 });
                await api.runtime.exec("sudo", ["yum", "install", "-y", "ffmpeg"], { timeout: 300000 });
              } catch {
                throw new Error("不支持的 Linux 发行版，请手动安装 ffmpeg");
              }
            }
          } else {
            throw new Error(`不支持的平台: ${platform}`);
          }
          break;
          
        case "WHISPER_MISSING":
          try {
            await api.runtime.exec("pip3", ["install", "-U", "openai-whisper"], { timeout: 300000 });
          } catch {
            await api.runtime.exec("pip", ["install", "-U", "openai-whisper"], { timeout: 300000 });
          }
          break;
          
        default:
          manualSteps.push(`${issue.code}: ${issue.message}`);
      }
      
      logger.info(`✅ 已修复: ${issue.code}`);
      
    } catch (error) {
      logger.error(`❌ 修复失败 ${issue.code}:`, error.message);
      manualSteps.push(`${issue.code}: ${issue.message} (自动修复失败: ${error.message})`);
    }
  }
  
  return {
    success: manualSteps.length === 0,
    manualSteps: manualSteps.length > 0 ? manualSteps : undefined
  };
}

// ============ 内部辅助函数 ============

async function checkFfmpeg(): Promise<{installed: boolean; version?: string; path?: string}> {
  return checkCommand("ffmpeg");
}

async function checkPython(): Promise<{installed: boolean; version?: string; path?: string}> {
  const python3Check = await checkCommand("python3");
  if (python3Check.installed) return python3Check;
  
  const pythonCheck = await checkCommand("python");
  if (pythonCheck.installed) {
    // 验证是否是 Python 3
    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      const { stdout } = await execAsync("python --version", { timeout: 5000 });
      if (stdout.includes("Python 3")) {
        return pythonCheck;
      }
    } catch {
      // 忽略
    }
  }
  
  return { installed: false };
}

async function checkWhisper(): Promise<{installed: boolean; version?: string}> {
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    
    const { stdout } = await execAsync("whisper --help 2>&1", { timeout: 10000 });
    if (stdout.includes("usage:") || stdout.includes("--model")) {
      // 尝试获取版本
      try {
        const { stdout: verOut } = await execAsync("pip3 show openai-whisper 2>/dev/null || pip show openai-whisper 2>/dev/null || echo 'Version: unknown'", { timeout: 10000 });
        const versionMatch = verOut.match(/Version:\s*(.+)/);
        return { 
          installed: true, 
          version: versionMatch ? versionMatch[1].trim() : undefined 
        };
      } catch {
        return { installed: true };
      }
    }
    return { installed: false };
  } catch {
    return { installed: false };
  }
}

async function checkCommand(cmd: string): Promise<{installed: boolean; version?: string; path?: string}> {
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    
    // 检查命令是否存在
    const { stdout: pathStdout } = await execAsync(
      `which ${cmd} 2>/dev/null || command -v ${cmd} 2>/dev/null || echo ""`,
      { timeout: 10000 }
    );
    const path = pathStdout.trim();
    
    if (!path) {
      return { installed: false };
    }
    
    // 获取版本
    let version = undefined;
    const versionCommands = [
      `${cmd} -version 2>&1`,
      `${cmd} --version 2>&1`,
      `${cmd} -V 2>&1`,
    ];
    
    for (const versionCmd of versionCommands) {
      try {
        const { stdout: verStdout } = await execAsync(versionCmd, { timeout: 10000 });
        const firstLine = verStdout.split("\n")[0].trim();
        if (firstLine && 
            !firstLine.toLowerCase().includes("not found") && 
            !firstLine.toLowerCase().includes("error") &&
            !firstLine.toLowerCase().includes("unknown")) {
          version = firstLine;
          break;
        }
      } catch {
        // 尝试下一个命令
      }
    }
    
    return { installed: true, version, path };
  } catch {
    return { installed: false };
  }
}

async function downloadWhisperModel(model: string, api: OpenClawPluginApi): Promise<boolean> {
  const logger = api.logger;
  
  logger.info(`📥 预下载 Whisper ${model} 模型...`);
  
  try {
    // 使用 whisper --help 触发模型下载
    await api.runtime.exec("whisper", ["--model", model, "--help"], { 
      timeout: 600000, // 10分钟
      env: { ...process.env }
    });
    
    return true;
  } catch (error) {
    logger.warn(`模型预下载失败: ${error.message}`);
    return false;
  }
}

async function processTranscriptionAsync(
  message: any,
  attachment: any,
  config: any,
  api: OpenClawPluginApi
) {
  const logger = api.logger;
  
  // 异步处理，不阻塞主流程
  setImmediate(async () => {
    try {
      logger.info("⚙️ 后台转录处理中...");
      const result = await transcribeWithFallback(message, attachment, config, api);
      
      // 注意：由于消息已经传递给 agent，这里无法修改原始消息
      // 只能记录结果供后续使用，或发送通知
      logger.info(`✅ 后台转录完成: ${result.text.substring(0, 50)}...`);
      
      // 存储在 message 的 hidden 属性中（如果支持）
      if (!message._transcriptions) {
        message._transcriptions = [];
      }
      message._transcriptions.push({
        ...result,
        timestamp: new Date().toISOString(),
      });
      
    } catch (error) {
      logger.error("❌ 后台转录失败:", error.message);
    }
  });
}

function injectTranscriptionResult(
  message: any,
  result: { text: string; source: string; confidence?: number },
  config: any
) {
  const sourceEmoji = result.source === "local-whisper" ? "🔒" : "🌐";
  const confidenceStr = result.confidence 
    ? ` (置信度: ${(result.confidence * 100).toFixed(1)}%)` 
    : "";
  
  const transcriptionHeader = `${sourceEmoji} [语音转文字${confidenceStr}]`;
  
  const originalText = message.text || "";
  message.text = `${transcriptionHeader}\n${result.text}${originalText ? '\n\n原文: ' + originalText : ''}`;
  
  message.transcription = {
    text: result.text,
    source: result.source,
    confidence: result.confidence,
    timestamp: new Date().toISOString(),
  };
  
  if (message.attachments) {
    message.attachments.forEach((att: any) => {
      if (att.mimeType?.startsWith("audio/") || att.mimeType?.startsWith("voice/")) {
        att.transcribed = true;
        att.transcription = result.text;
      }
    });
  }
}

function injectErrorResult(message: any, error: Error, config: any) {
  const originalText = message.text || "";
  message.text = `❌ [语音转文字失败]\n错误: ${error.message}${originalText ? '\n\n原文: ' + originalText : ''}`;
  
  message.transcription = {
    error: error.message,
    timestamp: new Date().toISOString(),
  };
}

// findAudioAttachment 函数已在主文件定义，这里导入使用
import { findAudioAttachment } from "./utils";
// transcribeWithFallback 函数已在主文件定义，这里需要导出
export { transcribeWithFallback };