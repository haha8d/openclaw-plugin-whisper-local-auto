import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

/**
 * 检查文件是否存在
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * 安全删除文件（忽略错误）
 */
export async function safeDelete(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // 忽略删除错误
  }
}

/**
 * 获取临时目录
 */
export function getTempDir(): string {
  const tempDir = path.join(os.tmpdir(), "whisper-local-auto");
  
  // 确保目录存在
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  return tempDir;
}

/**
 * 下载文件
 */
export async function downloadFile(url: string, api: OpenClawPluginApi): Promise<string> {
  const logger = api.logger;
  const tempDir = getTempDir();
  const fileName = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const filePath = path.join(tempDir, fileName);
  
  logger.debug(`下载文件: ${url.substring(0, 50)}...`);
  
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "OpenClaw-Whisper-Local-Auto/1.0.0",
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP 错误: ${response.status} ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    await fs.promises.writeFile(filePath, Buffer.from(buffer));
    
    logger.debug(`文件下载完成: ${filePath}`);
    
    return filePath;
  } catch (error) {
    // 清理失败下载
    await safeDelete(filePath);
    throw new Error(`下载文件失败: ${error.message}`);
  }
}

/**
 * 查找音频附件
 */
export function findAudioAttachment(message: any): any | undefined {
  if (!message.attachments || !Array.isArray(message.attachments)) {
    return undefined;
  }
  
  const audioMimeTypes = [
    "audio/",
    "voice/",
    "application/ogg",
  ];
  
  const audioExtensions = /\.(mp3|wav|ogg|m4a|aac|flac|opus|oga|ogx|weba|wma)$/i;
  
  return message.attachments.find((att: any) => {
    const mimeMatch = audioMimeTypes.some(mime => 
      att.mimeType?.toLowerCase().startsWith(mime)
    );
    const extMatch = audioExtensions.test(att.fileName || "");
    return mimeMatch || extMatch;
  });
}

/**
 * 格式化时长
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs.toFixed(0)}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
}

/**
 * 截断文本
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + "...";
}