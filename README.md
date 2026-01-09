# 🛡️ Gemini 2.0 AI Health Agent (RAG + Tool Use + Memory)

這是一個基於 **Gemini 2.0 Flash** 構建的高性能 AI Agent 實作專案。
本專案整合了向量資料庫 (RAG)、外部工具呼叫 (Function Calling) 與動態對話記憶，打造一個能理解私有知識並處理即時數據的醫療健康助理。

目前以「Microlife 血壓計說明書」與「個人血壓紀錄分析」作為核心應用場景。

## 🚀 核心技術架構

- **LLM 模型**: Google Gemini 2.0 Flash
  - 支援高精度的工具呼叫 (Function Calling) 與邏輯推理。
- **嵌入模型 (Embeddings)**: `text-embedding-004`
  - 用於將文件轉化為高品質的高維向量。
- **向量資料庫**: PostgreSQL + `pgvector`
  - 實現精準的語義搜尋，從大量說明書中檢索相關資訊。
- **開發框架**:
  - **Node.js & Express**: 後端伺服器架構。
  - **LangChain (Community)**: 簡化向量儲存與相似度檢索流程。
- **智慧工具控制**:
  - 實作了「按需分析」邏輯。模型會根據使用者意圖判斷僅顯示數據、計算平均值或進行健康評估。

## 🛠️ 功能模組

1. **RAG 知識檢索**:
   - 透過 `ingest.js` 自動解析 PDF 並存入 `pgvector`。
   - 提問時，系統會自動擷取說明書片段作為參考資料，回答如「ERR 3 錯誤代碼」等專業問題。
2. **血壓工具整合 (Tool Use)**:
   - 串接 `getBloodPressureData` 工具。
   - **智能判定**：當使用者詢問「看紀錄」時列出清單；詢問「狀況好嗎」或「算平均」時，則自動進行數據統計與醫學標準對照。
3. **對話記憶 (Memory)**:
   - 具備 Context 記憶功能，能理解「那該怎麼辦？」等指代性提問，並在 Session 結束前保持連貫。

## 📖 快速開始

### 1. 環境準備

建立 `.env` 檔案並填入以下資訊：

```env
# Google Gemini API 金鑰
GEMINI_API_KEY=your_gemini_api_key_here

# 伺服器埠號
PORT=3000

# PostgreSQL 連線字串 (需包含 pgvector 擴充)
DATABASE_URL=postgres://postgres:your_password@127.0.0.1:5432/postgres
```
### 2. 安裝與執行

# 安裝相依套件

npm install

# 啟動含 pgvector 的資料庫 (若使用 Docker)

docker run --name pgvector -e POSTGRES_PASSWORD=your_password -p 5432:5432 -d ankane/pgvector

# 導入說明書資料 (確保根目錄有 pdf 檔案)

node ingest.js

# 啟動伺服器

node server.js
### 📝 測試案例
知識庫測試：詢問「血壓計顯示 ERR 2 是什麼意思？」

預期：AI 會根據說明書回答是「訊號過弱」並提供操作建議。

即時數據測試：詢問「幫我列出最近 5 筆血壓紀錄。」

預期：AI 呼叫工具並以簡潔清單呈現，不進行多餘的統計。

分析推理測試：詢問「我這個月的血壓平均是多少？狀況穩定嗎？」

預期：AI 會計算平均 SYS/DIA，並對照 120/80 mmHg 標準給予分析建議。

邊界防禦測試：詢問「推薦我幾支股票？」

預期：AI 會根據系統指令，禮貌地表示無法回答健康與產品以外的話題。

# ⚠️ 注意事項
資料安全：本專案僅供開發測試參考，醫療建議請諮詢專業醫師。
PDF 檔案：請自行將產品說明書 PDF 放入專案根目錄，並於 ingest.js 中指定檔名。
