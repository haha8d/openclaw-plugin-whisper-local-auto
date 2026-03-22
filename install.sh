#!/bin/bash
# Whisper Local Auto - One-click installer
# This script installs the OpenClaw plugin for automatic voice transcription

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PLUGIN_NAME="whisper-local-auto"
REPO_URL="https://github.com/haha8d/openclaw-plugin-whisper-local-auto"
INSTALL_DIR="${HOME}/.openclaw/extensions/${PLUGIN_NAME}"

# Helper functions
print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║     Whisper Local Auto - OpenClaw Plugin Installer        ║"
    echo "║     Automatic Voice-to-Text for All Channels              ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    # Check for git
    if ! command -v git &> /dev/null; then
        print_error "git is not installed. Please install git first."
        echo "   macOS: brew install git"
        echo "   Ubuntu/Debian: sudo apt-get install git"
        echo "   CentOS/RHEL: sudo yum install git"
        exit 1
    fi
    print_success "git is installed"
    
    # Check for OpenClaw directory
    if [ ! -d "${HOME}/.openclaw" ]; then
        print_warning "OpenClaw directory not found at ${HOME}/.openclaw"
        print_info "The plugin will be installed, but you'll need OpenClaw to use it."
    fi
    
    print_success "Prerequisites check completed"
}

# Install the plugin
install_plugin() {
    print_info "Installing Whisper Local Auto plugin..."
    
    # Remove existing installation if present
    if [ -d "$INSTALL_DIR" ]; then
        print_warning "Existing installation found at $INSTALL_DIR"
        print_info "Removing old installation..."
        rm -rf "$INSTALL_DIR"
    fi
    
    # Create extensions directory if it doesn't exist
    mkdir -p "$(dirname "$INSTALL_DIR")"
    
    # Clone the repository
    print_info "Cloning repository from GitHub..."
    if git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"; then
        print_success "Plugin installed successfully to $INSTALL_DIR"
    else
        print_error "Failed to clone repository"
        exit 1
    fi
    
    # Clean up git history (optional, saves space)
    if [ -d "$INSTALL_DIR/.git" ]; then
        rm -rf "$INSTALL_DIR/.git"
        print_info "Cleaned up git history to save space"
    fi
}

# Print next steps
print_next_steps() {
    echo ""
    print_header
    print_success "Installation completed! 🎉"
    echo ""
    echo -e "${BLUE}What's next?${NC}"
    echo ""
    echo "1. ${YELLOW}Configure OpenClaw${NC}"
    echo "   Add the following to your ~/.openclaw/openclaw.json:"
    echo ""
    echo '   {'
    echo '     "plugins": {'
    echo '       "enabled": true,'
    echo '       "allow": ["whisper-local-auto"],'
    echo '       "entries": {'
    echo '         "whisper-local-auto": {'
    echo '           "enabled": true,'
    echo '           "config": {'
    echo '             "model": "small",'
    echo '             "fallbackToApi": true'
    echo '           }'
    echo '         }'
    echo '       }'
    echo '     }'
    echo '   }'
    echo ""
    echo "2. ${YELLOW}Restart OpenClaw Gateway${NC}"
    echo "   openclaw gateway restart"
    echo ""
    echo "3. ${YELLOW}Configure the plugin${NC}"
    echo "   On first use, the plugin will guide you through:"
    echo "   - Installing ffmpeg (if not present)"
    echo "   - Installing Python & Whisper (if not present)"
    echo "   - Selecting your preferred model"
    echo "   - Optional: Setting up OpenAI API fallback"
    echo ""
    echo "4. ${YELLOW}Start using!${NC}"
    echo "   Send a voice message in any OpenClaw channel"
    echo "   and watch it automatically transcribe! 🎙️"
    echo ""
    echo -e "${BLUE}Documentation:${NC} https://github.com/haha8d/openclaw-plugin-whisper-local-auto#readme"
    echo -e "${BLUE}Issues/Help:${NC} https://github.com/haha8d/openclaw-plugin-whisper-local-auto/issues"
    echo ""
    print_success "Enjoy frictionless voice communication! 🎉"
    echo ""
}

# Main
main() {
    print_header
    
    echo "This script will install the Whisper Local Auto plugin for OpenClaw."
    echo "It enables automatic voice-to-text transcription across all channels."
    echo ""
    
    read -p "Continue with installation? (y/N) " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Installation cancelled."
        exit 0
    fi
    
    check_prerequisites
    install_plugin
    print_next_steps
}

main "$@"