import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { fileExists, safeDelete, getTempDir } from "./utils";

const execAsync = promisify(exec);

// 全局临时文件追踪，用于清理
const tempFiles: Set<string> = new Set();

export interface TranscribeOptions {
  filePath: string;
  model?: string;
  preferLocal?: boolean;
  fallbackToApi?: boolean;
  apiKey?: string;
  language?: string;
  task?: "transcribe" | "translate";
}

export interface TranscribeResult {
  text: string;
  confidence?: number;
  source: "local-whisper" | "openai-api" | "fallback";
  duration?: number;
  language?: string;
}

/**
 * 主转录函数 - 优先本地 Whisper，支持 API 降级
 */
export async function transcribeAudio(
  options: TranscribeOptions,
  api: OpenClawPluginApi
): Promise<TranscribeResult> {
  const logger = api.logger;
  const { filePath, model = "small", preferLocal = true, fallbackToApi = true } = options;
  
  // 验证输入文件
  if (!await fileExists(filePath)) {
    throw new Error(`音频文件不存在: ${filePath}`);
  }
  
  // 优先使用本地 Whisper
  if (preferLocal) {
    try {
      logger.debug("尝试本地 Whisper 转录...");
      const result = await transcribeWithLocalWhisper(filePath, model, options, api);
      return { ...result, source: "local-whisper" };
    } catch (error) {
      logger.warn("本地 Whisper 转录失败:", error.message);
      
      if (!fallbackToApi) {
        throw new Error(`本地转录失败且未启用 API 降级: ${error.message}`);
      }
    }
  }
  
  // 降级到 OpenAI API
  if (fallbackToApi && options.apiKey) {
    try {
      logger.debug("尝试 OpenAI API 转录...");
      const result = await transcribeWithOpenAI(filePath, options, api);
      return { ...result, source: "openai-api" };
    } catch (error) {
      logger.error("OpenAI API 转录也失败:", error.message);
      throw new Error(`本地和 API 转录均失败: ${error.message}`);
    }
  }
  
  throw new Error("转录失败: 本地模型不可用且未配置 API Key");
}

/**
 * 使用本地 Whisper 转录
 */
async function transcribeWithLocalWhisper(
  filePath: string,
  model: string,
  options: TranscribeOptions,
  api: OpenClawPluginApi
): Promise<Omit<TranscribeResult, "source">> {
  const logger = api.logger;
  
  // 构建命令
  const args = [
    filePath,
    "--model", model,
    "--language", options.language || "zh",
    "--task", options.task || "transcribe",
    "--output_format", "txt",
    "--output_dir", getTempDir(),
  ];
  
  logger.debug(`执行: whisper ${args.join(" ")}`);
  
  const startTime = Date.now();
  
  try {
    const { stdout, stderr } = await execAsync(`whisper ${args.map(a => `"${a}"`).join(" ")}`, {
      timeout: 600000, // 10分钟
      encoding: "utf8",
    });
    
    const duration = (Date.now() - startTime) / 1000;
    
    // 解析输出文件
    const baseName = path.basename(filePath, path.extname(filePath));
    const outputFile = path.join(getTempDir(), `${baseName}.txt`);
    
    if (await fileExists(outputFile)) {
      const text = await fs.promises.readFile(outputFile, "utf8");
      
      // 清理输出文件
      await safeDelete(outputFile);
      
      return {
        text: text.trim(),
        duration,
        language: options.language || "zh",
      };
    }
    
    // 如果没有输出文件，尝试从 stdout 解析
    const lines = stdout.split("\n").filter(l => l.trim());
    if (lines.length > 0) {
      return {
        text: lines[lines.length - 1].trim(),
        duration,
        language: options.language || "zh",
      };
    }
    
    throw new Error("Whisper 未产生输出");
    
  } catch (error) {
    // 清理临时文件
    const baseName = path.basename(filePath, path.extname(filePath));
    const outputFile = path.join(getTempDir(), `${baseName}.txt`);
    await safeDelete(outputFile);
    
    throw new Error(`Whisper 转录失败: ${error.message}`);
  }
}

/**
 * 使用 OpenAI API 转录
 */
async function transcribeWithOpenAI(
  filePath: string,
  options: TranscribeOptions,
  api: OpenClawPluginApi
): Promise<Omit<TranscribeResult, "source">> {
  const logger = api.logger;
  const apiKey = options.apiKey;
  
  if (!apiKey) {
    throw new Error("未提供 OpenAI API Key");
  }
  
  logger.debug("使用 OpenAI Whisper API...");
  
  const startTime = Date.now();
  
  try {
    // 使用 OpenClaw 内置的 HTTP 工具或 fetch
    const fs = await import("fs");
    const fileBuffer = await fs.promises.readFile(filePath);
    const blob = new Blob([fileBuffer]);
    
    const formData = new FormData();
    formData.append("file", blob, path.basename(filePath));
    formData.append("model", "whisper-1");
    formData.append("language", options.language || "zh");
    formData.append("response_format", "json");
    
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API 请求失败 (${response.status}): ${errorData.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    const duration = (Date.now() - startTime) / 1000;
    
    return {
      text: data.text?.trim() || "",
      duration,
      language: data.language || options.language || "zh",
    };
    
  } catch (error) {
    throw new Error(`OpenAI API 转录失败: ${error.message}`);
  }
}

/**
 * 清理所有临时文件
 */
export async function cleanupTempFiles(): Promise<void> {
  for (const filePath of tempFiles) {
    await safeDelete(filePath);
  }
  tempFiles.clear();
}