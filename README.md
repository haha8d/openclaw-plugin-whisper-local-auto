# Whisper Local Auto

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![OpenClaw Plugin](https://img.shields.io/badge/OpenClaw-Plugin-blue.svg)]()

> **Auto-transcribe voice messages to text using local Whisper — works across all OpenClaw channels (Feishu, Telegram, WhatsApp, etc.)**

## ✨ Features

- 🎯 **Auto-detection**: Automatically detects and transcribes voice messages from any channel
- 🔒 **Privacy-first**: Uses local Whisper model by default, no data leaves your machine
- 🌐 **Smart fallback**: Falls back to OpenAI API only when local model fails
- 🚀 **One-click setup**: Auto-installs ffmpeg, Python, and Whisper on first use
- 📱 **Universal**: Works with Feishu, Telegram, WhatsApp, and all other OpenClaw channels

## 🚀 Quick Start

### Installation

```bash
# Install via OpenClaw CLI
openclaw plugins install https://github.com/haha8d/openclaw-plugin-whisper-local-auto

# Or clone manually
git clone https://github.com/haha8d/openclaw-plugin-whisper-local-auto.git \
  ~/.openclaw/extensions/whisper-local-auto
```

### Configuration

Add to your `~/.openclaw/openclaw.json`:

```json5
{
  plugins: {
    enabled: true,
    allow: ["whisper-local-auto"],
    entries: {
      "whisper-local-auto": {
        enabled: true,
        config: {
          model: "small",           // tiny | base | small | medium | large
          fallbackToApi: true,      // Fallback to OpenAI API on failure
          openaiApiKey: "sk-...",   // Optional: for API fallback
          autoInstallDeps: true,    // Auto-install ffmpeg & whisper
        }
      }
    }
  }
}
```

### Usage

Just send a voice message in any OpenClaw channel — it will be automatically transcribed!

```
[User sends voice message]
          ↓
[Plugin auto-transcribes]
          ↓
🔒 [语音转文字] This is the transcribed text content...
```

## 🔧 Model Selection

| Model | Size | Speed | Accuracy | Recommended Use |
|-------|------|-------|----------|-----------------|
| tiny | ~39MB | ⚡ Fastest | ⭐ Fair | Testing, real-time |
| base | ~74MB | ⚡ Fast | ⭐⭐ Good | Daily use |
| small | ~244MB | 🚀 Medium | ⭐⭐⭐ Better | **Recommended** |
| medium | ~769MB | 🐢 Slow | ⭐⭐⭐⭐ Very Good | High accuracy |
| large | ~1.5GB | 🐢 Slowest | ⭐⭐⭐⭐⭐ Best | With GPU only |

## 🛠️ Troubleshooting

### ffmpeg not installed

The plugin will auto-install ffmpeg. If it fails:

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get update
sudo apt-get install ffmpeg

# CentOS/RHEL
sudo yum install ffmpeg
```

### Whisper model download is slow

Models are downloaded automatically on first use:
- tiny: ~39MB
- base: ~74MB
- small: ~244MB
- medium: ~769MB
- large: ~1.5GB

Use `small` for the best balance.

### Transcription fails with API error

Check:
1. API Key format (should start with `sk-`)
2. Account has sufficient credits
3. Network connection is stable

## 🔒 Privacy

- ✅ **Local-first**: Voice data stays on your machine by default
- ✅ **No cloud**: Local Whisper model processes everything locally
- ✅ **Optional API**: OpenAI API is only used as fallback when enabled
- ✅ **Auto-cleanup**: Audio files are deleted after transcription (configurable)

## 📄 License

MIT License - see [LICENSE](LICENSE) file

## 🤝 Contributing

Contributions welcome! Please submit issues and pull requests.

## 👤 Author

Xia Ge

---

**Enjoy frictionless voice communication!** 🎙️✨