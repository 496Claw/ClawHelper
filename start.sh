#!/usr/bin/env bash
# 啟動 ClawHelper 本地開發 server（port 3000）
# Magic Link 會 redirect 到 http://localhost:3000/

cd "$(dirname "$0")"

echo "🦀 ClawHelper 啟動中..."
echo "📌 請用瀏覽器開啟：http://localhost:3000/"
echo "   （Supabase Magic Link 會 redirect 到這個位址）"
echo ""

# 優先用 Python，任何 Mac 都有
if command -v python3 &>/dev/null; then
    python3 -m http.server 3000
elif command -v npx &>/dev/null; then
    npx serve . -p 3000
else
    echo "❌ 找不到 python3 或 npx，請手動啟動 HTTP server on port 3000"
    exit 1
fi
