---
name: whisper-local-auto
description: 自动将语音消息转录为文字 - 支持本地 Whisper 和 OpenAI API
version: 1.0.0
author: Xia Ge
---

# Whisper Local Auto

自动语音转文字插件 - 跨所有 OpenClaw Channel 工作

## 功能特点

- 🎯 **自动检测**: 自动识别所有音频格式的语音消息
- 🔒 **本地优先**: 优先使用本地 Whisper 模型，保护隐私
- 🌐 **API 降级**: 本地失败时自动使用 OpenAI API
- 🚀 **一键安装**: 自动安装 ffmpeg、whisper 等依赖
- 📱 **全平台**: 支持飞书、Telegram、WhatsApp 等所有 Channel

## 使用方法

安装后，直接发送语音消息，自动转录为文字：

```
[用户发送语音消息]
↓
[插件自动转录]
↓
🔒 [语音转文字] 这是转录的文字内容...
```

## 配置选项

```json
{
  "whisper-local-auto": {
    "model": "small",
    "fallbackToApi": true,
    "openaiApiKey": "sk-...",
    "autoInstallDeps": true,
    "keepAudioFiles": false
  }
}
```

### 模型选择

| 模型 | 大小 | 速度 | 准确率 | 推荐场景 |
|------|------|------|--------|----------|
| tiny | ~39MB | 最快 | 一般 | 测试、实时 |
| base | ~74MB | 快 | 较好 | 日常使用 |
| small | ~244MB | 中等 | 好 | **推荐** |
| medium | ~769MB | 慢 | 很好 | 高准确率 |
| large | ~1.5GB | 很慢 | 最好 | 需要 GPU |

## 安装依赖

插件会自动安装以下依赖：

1. **ffmpeg** - 音频格式转换
2. **Python 3.8+** - 运行环境
3. **openai-whisper** - 本地语音识别模型

## 故障排除

### 问题: "ffmpeg 未安装"

**解决**: 插件会自动安装，或手动运行：
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# CentOS/RHEL
sudo yum install ffmpeg
```

### 问题: "Whisper 模型下载慢"

**解决**: 模型首次使用自动下载，约 39MB-1.5GB，取决于选择的模型。

或使用镜像：
```bash
export WHISPER_MODELS_URL="https://mirrors.example.com/whisper"
```

### 问题: "转录失败，但 API Key 已配置"

**检查**:
1. API Key 格式是否正确 (应以 `sk-` 开头)
2. 账户是否有足够余额
3. 网络连接是否正常

## 隐私说明

- ✅ **本地优先**: 优先使用本地模型，语音数据不上传
- ✅ **可选 API**: 仅在本地失败且用户配置后才使用 OpenAI API
- ✅ **临时文件**: 音频文件转录后自动删除（除非配置保留）

## 开源协议

MIT License - 详见 LICENSE 文件

## 贡献

欢迎提交 Issue 和 PR！

## 作者

Xia Ge

---

**享受无摩擦的语音交流！** 🎙️✨