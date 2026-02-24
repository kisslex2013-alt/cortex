#!/bin/bash
# ============================================================================
# 🧩 Jarvis Memory Extensions — Installation Script
# 
# Installs: ACE Framework, Open-RAG-Eval, Python dependencies
# Run: bash scripts/setup/install_extensions.sh
#
# Prerequisites: Python 3.10+, pip, Node.js 18+
# ============================================================================

set -e

JARVIS_ROOT="${JARVIS_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
echo "📦 Jarvis Memory Extensions Installer"
echo "   Root: $JARVIS_ROOT"
echo "============================================"

# 1. Check Python
echo ""
echo "🐍 Step 1: Checking Python..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Install: apt install python3 python3-pip"
    exit 1
fi
PYTHON_VERSION=$(python3 --version 2>&1)
echo "   ✅ Found: $PYTHON_VERSION"

# 2. Create virtual environment (if not exists)
echo ""
echo "🏗️ Step 2: Setting up virtual environment..."
VENV_DIR="$JARVIS_ROOT/.venv"
if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
    echo "   ✅ Created: $VENV_DIR"
else
    echo "   ✅ Already exists: $VENV_DIR"
fi
source "$VENV_DIR/bin/activate"

# 3. Install ACE Framework
echo ""
echo "🧠 Step 3: Installing ACE Framework (Agentic Context Engine)..."
pip install --quiet ace-framework 2>/dev/null || {
    echo "   ⚠️ ace-framework not available via pip, installing from git..."
    pip install --quiet git+https://github.com/kayba-ai/agentic-context-engine.git 2>/dev/null || {
        echo "   ⚠️ ACE install failed — will use built-in skillbook instead"
    }
}
echo "   ✅ ACE installed (or skipped)"

# 4. Install Open-RAG-Eval
echo ""
echo "📊 Step 4: Installing Open-RAG-Eval..."
pip install --quiet open-rag-eval 2>/dev/null || {
    echo "   ⚠️ open-rag-eval install failed — RAG evaluation will be manual"
}
echo "   ✅ Open-RAG-Eval installed (or skipped)"

# 5. Install litellm for multi-model support
echo ""
echo "🔗 Step 5: Installing LiteLLM (multi-model proxy)..."
pip install --quiet litellm 2>/dev/null || true
echo "   ✅ LiteLLM installed (or skipped)"

# 6. Create config directories
echo ""
echo "📁 Step 6: Creating config directories..."
mkdir -p "$JARVIS_ROOT/config/extensions"
mkdir -p "$JARVIS_ROOT/memory/skillbook"
mkdir -p "$JARVIS_ROOT/memory/rag_eval"
echo "   ✅ Directories created"

# 7. Create ACE config
echo ""
echo "⚙️ Step 7: Writing extension configs..."
cat > "$JARVIS_ROOT/config/extensions/ace_config.json" << 'EOF'
{
    "model": "gemini-2.0-flash",
    "skillbook_path": "memory/skillbook/jarvis_skills.md",
    "max_skills": 50,
    "reflection_enabled": true,
    "auto_learn": true,
    "learning_categories": [
        "staking_operations",
        "api_management",
        "memory_operations",
        "security_protocols",
        "user_interactions"
    ]
}
EOF

cat > "$JARVIS_ROOT/config/extensions/rag_eval_config.json" << 'EOF'
{
    "eval_schedule": "weekly",
    "output_dir": "memory/rag_eval",
    "test_queries": [
        "Какой текущий баланс кошелька?",
        "Какие модули входят в cortex?",
        "Когда последний раз стейкали TON?",
        "Какой pool address для Tonstakers?",
        "Что произошло 17 февраля?"
    ],
    "metrics": ["relevance", "faithfulness", "coverage"]
}
EOF
echo "   ✅ Configs written"

# 8. Verify
echo ""
echo "============================================"
echo "✅ Installation complete!"
echo ""
echo "Installed packages:"
pip list 2>/dev/null | grep -iE "ace|rag-eval|litellm" || echo "   (check pip list manually)"
echo ""
echo "Next steps:"
echo "  1. Set OPENAI_API_KEY or GEMINI_API_KEY in .env"
echo "  2. Run: node scripts/tests/test_extensions.js"
echo "  3. Start skillbook: node scripts/evolution/skillbook_engine.js"
echo "============================================"
