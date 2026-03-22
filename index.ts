import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { runInstallWizard } from "./src/install";
import { runHealthCheck, autoFixIssues } from "./src/health-check";
import { transcribeAudio, cleanupTempFiles } from "./src/transcribe";
import { downloadFile, fileExists, safeDelete } from "./src/utils";

export default async function register(api: OpenClawPluginApi) {
  const logger = api.logger;
  
  logger.info("🔊 [whisper-local-auto] 插件加载中...");

  // ============ 1. 获取或初始化配置 ============
  let config = api.config.get("whisper-local-auto");
  
  if (!config || !config.initialized) {
    logger.info("🆕 首次使用，启动配置向导...");
    const wizardResult = await runInstallWizard(api);
    
    if (!wizardResult.success) {
      logger.error("❌ 配置向导未完成，插件禁用");
      return;
    }
    
    config = {
      ...wizardResult.config,
      initialized: true,
    };
    
    // 保存配置
    await api.config.set("whisper-local-auto", config);
    logger.info("✅ 配置已保存");
  }

  // ============ 2. 健康检查（非阻塞） ============
  logger.info("🏥 运行健康检查...");
  runHealthCheck(api).then(async (health) => {
    if (!health.healthy) {
      logger.warn("⚠️ 健康检查发现问题:", health.issues);
      
      if (config.autoInstallDeps !== false) {
        logger.info("🔧 尝试自动修复...");
        const fixed = await autoFixIssues(api, health.issues);
        if (fixed.success) {
          logger.info("✅ 问题已修复");
        } else {
          logger.warn("⚠️ 自动修复失败，请手动解决:", fixed.manualSteps);
        }
      }
    } else {
      logger.info("✅ 健康检查通过");
    }
  }).catch(err => {
    logger.error("健康检查失败:", err);
  });

  // ============ 3. 注册消息处理 Hook ============
  logger.info("🎣 注册语音消息拦截器...");
  
  api.on("before_agent_start", async (event, ctx) => {
    const { message } = event;
    
    // 调试日志（仅在 debug 模式）
    if (process.env.DEBUG_WHISPER) {
      logger.debug("收到消息:", {
        id: message.id,
        text: message.text?.substring(0, 100),
        attachments: message.attachments?.map(a => ({ mime: a.mimeType, name: a.fileName })),
      });
    }
    
    // 查找音频附件
    const audioAttachment = findAudioAttachment(message);
    
    if (!audioAttachment) {
      return { ok: true }; // 不是音频，正常流程
    }

    logger.info(`🎵 检测到语音消息: ${audioAttachment.fileName || 'unnamed'} (${audioAttachment.mimeType})`);
    
    // 如果配置了后台转录，异步处理
    if (config.transcribeInBackground) {
      logger.info("⚙️ 后台转录模式，继续正常流程...");
      processTranscriptionAsync(message, audioAttachment, config, api);
      return { ok: true };
    }
    
    // 同步转录（阻塞模式，更准确）
    try {
      const result = await transcribeWithFallback(message, audioAttachment, config, api);
      
      // 注入转录结果
      injectTranscriptionResult(message, result, config);
      
      logger.info(`✅ 转录完成 (${result.source}): ${result.text.substring(0, 50)}...`);
      
    } catch (error) {
      logger.error("❌ 转录失败:", error);
      injectErrorResult(message, error, config);
    }
    
    return { ok: true };
  });

  // 注册清理钩子
  api.on("plugin:shutdown", async () => {
    logger.info("🧹 清理临时文件...");
    await cleanupTempFiles();
  });

  logger.info("✅ [whisper-local-auto] 插件加载完成！");
  logger.info("📖 使用说明: 发送语音消息，自动转录为文字");
}

// ============ 辅助函数 ============

function findAudioAttachment(message: any): any | undefined {
  if (!message.attachments || !Array.isArray(message.attachments)) {
    return undefined;
  }
  
  const audioMimeTypes = [
    "audio/",
    "voice/",
    "application/ogg",
  ];
  
  const audioExtensions = /\.(mp3|wav|ogg|m4a|aac|flac|opus|oga|ogx)$/i;
  
  return message.attachments.find(att => {
    const mimeMatch = audioMimeTypes.some(mime => 
      att.mimeType?.toLowerCase().startsWith(mime)
    );
    const extMatch = audioExtensions.test(att.fileName || "");
    return mimeMatch || extMatch;
  });
}

async function transcribeWithFallback(
  message: any,
  attachment: any,
  config: any,
  api: OpenClawPluginApi
): Promise<{ text: string; source: string; confidence?: number }> {
  const logger = api.logger;
  let localPath = attachment.localPath;
  
  // 1. 确保文件已下载
  if (!localPath || !(await fileExists(localPath))) {
    if (attachment.url) {
      logger.info("📥 下载音频文件...");
      localPath = await downloadFile(attachment.url, api);
    } else {
      throw new Error("无法获取音频文件: 无本地路径也无下载URL");
    }
  }
  
  // 2. 尝试本地转录
  try {
    logger.info(`🎯 尝试本地 Whisper 转录 (模型: ${config.model})...`);
    const result = await transcribeAudio({
      filePath: localPath,
      model: config.model,
      preferLocal: true,
    }, api);
    
    if (result.text && result.text.trim()) {
      return {
        text: result.text,
        source: "local-whisper",
        confidence: result.confidence,
      };
    }
  } catch (error) {
    logger.warn("⚠️ 本地转录失败:", error.message);
  }
  
  // 3. 降级到 API
  if (config.fallbackToApi && config.openaiApiKey) {
    try {
      logger.info("🌐 降级到 OpenAI API...");
      const result = await transcribeAudio({
        filePath: localPath,
        preferLocal: false,
        apiKey: config.openaiApiKey,
      }, api);
      
      return {
        text: result.text,
        source: "openai-api",
        confidence: result.confidence,
      };
    } catch (error) {
      logger.error("❌ API 转录也失败:", error.message);
      throw new Error(`转录失败: 本地和 API 均不可用 - ${error.message}`);
    }
  }
  
  throw new Error("转录失败: 本地模型不可用且未配置 API 降级");
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
  
  // 构造新消息文本
  const originalText = message.text || "";
  message.text = `${transcriptionHeader}\n${result.text}${originalText ? '\n\n原文: ' + originalText : ''}`;
  
  // 添加元数据
  message.transcription = {
    text: result.text,
    source: result.source,
    confidence: result.confidence,
    timestamp: new Date().toISOString(),
  };
  
  // 标记原始音频为已转录
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

async function processTranscriptionAsync(
  message: any,
  attachment: any,
  config: any,
  api: OpenClawPluginApi
) {
  // 异步处理，不阻塞主流程
  api.logger.info("⚙️ 后台转录中...");
  
  // 启动异步任务
  transcribeWithFallback(message, attachment, config, api)
    .then(result => {
      injectTranscriptionResult(message, result, config);
      api.logger.info(`✅ 后台转录完成: ${result.text.substring(0, 50)}...`);
      
      // 可选：发送通知或更新消息
      // api.runtime.notify({...})
    })
    .catch(error => {
      api.logger.error("❌ 后台转录失败:", error);
      injectErrorResult(message, error, config);
    });
}