require('dotenv').config();
const express = require('express');
// 引入 RAG 必要的套件
const { PGVectorStore } = require("@langchain/community/vectorstores/pgvector");
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();
app.use(express.json());
app.use(express.static('public'));


const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// --- 1. RAG & 資料庫配置 ---
const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GEMINI_API_KEY,
  modelName: "text-embedding-004",
});

const pgConfig = {
  postgresConnectionOptions: {
    connectionString: process.env.DATABASE_URL,
  },
  tableName: "bp_docs_gemini",
  columns: {
    idColumnName: "id",
    vectorColumnName: "embedding",
    contentColumnName: "text",
    metadataColumnName: "metadata",
  },
};

// --- 2. 重試工具 (保持不變) ---
async function callWithRetry(fn, retries = 1, initialDelay = 3000) {
  try {
    return await fn();
  } catch (error) {
    if (error.status === 429 && retries > 0) {
      console.warn(`[Quota Exceeded] 觸發限制，${initialDelay / 1000}秒後進行重試...`);
      await new Promise(res => setTimeout(res, initialDelay));
      return callWithRetry(fn, retries - 1, initialDelay);
    }
    throw error;
  }
}

// --- 工具定義 ---
const getBloodPressureData = async (args) => {
  // 模擬 2025 年的血壓數據庫
  const bpHistory = [
    { date: "2025-01-05", sys: 118, dia: 78, pul: 72 },
    { date: "2025-01-20", sys: 122, dia: 80, pul: 75 },
    { date: "2025-02-12", sys: 125, dia: 82, pul: 68 },
    { date: "2025-02-25", sys: 120, dia: 79, pul: 70 },
    { date: "2025-03-08", sys: 119, dia: 77, pul: 74 },
    { date: "2025-03-22", sys: 121, dia: 81, pul: 71 },
    { date: "2025-04-10", sys: 124, dia: 83, pul: 73 },
    { date: "2025-04-28", sys: 118, dia: 76, pul: 69 },
    { date: "2025-05-15", sys: 117, dia: 75, pul: 72 },
    { date: "2025-05-30", sys: 120, dia: 78, pul: 76 },
    { date: "2025-06-11", sys: 122, dia: 80, pul: 70 },
    { date: "2025-06-25", sys: 126, dia: 84, pul: 74 },
    { date: "2025-07-04", sys: 123, dia: 81, pul: 75 },
    { date: "2025-07-19", sys: 121, dia: 79, pul: 72 },
    { date: "2025-08-05", sys: 119, dia: 78, pul: 71 },
    { date: "2025-08-20", sys: 120, dia: 80, pul: 73 },
    { date: "2025-09-12", sys: 122, dia: 82, pul: 68 },
    { date: "2025-09-28", sys: 118, dia: 77, pul: 70 },
    { date: "2025-10-03", sys: 125, dia: 85, pul: 77 },
    { date: "2025-10-21", sys: 121, dia: 80, pul: 74 },
    { date: "2025-11-09", sys: 123, dia: 81, pul: 72 },
    { date: "2025-11-24", sys: 119, dia: 78, pul: 70 },
    { date: "2025-12-10", sys: 126, dia: 83, pul: 75 },
    { date: "2025-12-25", sys: 122, dia: 80, pul: 71 }
  ];

  // 根據傳入的使用者 ID 回傳資料 (這裡假設輸入正確即回傳全部資料)
  if (args.userId) {
    return {
      status: "success",
      userId: args.userId,
      data: bpHistory
    };
  } else {
    return { status: "error", message: "請提供使用者 ID" };
  }
};
const agentTools = [{
  function_declarations: [{
    name: "getBloodPressureData",
    description: "獲取使用者血壓歷史紀錄以進行統計分析。必須直接調用此函數獲取數據，禁止輸出代碼塊。",
    parameters: {
      type: "object",
      properties: {
        userId: { type: "string", description: "使用者的唯一 ID" }
      },
      required: ["userId"] // 確保這是必填
    }
  }]
}];
// 在 app 外部定義記憶體，以 userId 為 key 存儲對話陣列
const chatHistoryMap = new Map();

// --- 4. API 路由 (加入 RAG 邏輯 + 簡易記憶) ---
app.post('/chat', async (req, res) => {
  const { message, userId = "default-user" } = req.body;

  try {
    const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
    let history = chatHistoryMap.get(userId) || [];

    // --- 1. 【RAG 步驟】 ---
    let context = "";
    try {
      const vectorStore = await PGVectorStore.initialize(embeddings, pgConfig);
      const searchResults = await vectorStore.similaritySearch(message, 3);
      if (searchResults.length > 0) {
        context = searchResults.map(doc => doc.pageContent).join("\n\n");
      }
    } catch (dbError) {
      console.error("❌ 檢索失敗:", dbError.message);
    }

    const ragPrompt = `
    【參考資料】：
    ${context}
    【任務指令】：
    1. 你是專業醫療健康助理。若問及操作問題，請參考【參考資料】。
    2. 若使用者詢問其個人的血壓狀況，請立即調用 getBloodPressureData 獲取數據。
    3. **輸出規範**：
       - 若使用者僅要求「查看資料」或「列出紀錄」，請以表格或清單形式呈現數據即可。
       - 若使用者要求「計算平均」、「分析趨勢」或詢問「狀況好嗎」，則需計算平均值並對照醫學標準（120/80 mmHg 以下為正常）給予專業評估。
       - 若數據顯示異常，請溫柔提醒使用者諮詢專業醫師。
    4. 禁止在調用工具前輸出任何預告文字。
    5. 嚴禁回答與醫療、健康、本血壓計產品無關的話題。`;

    // 構建發送給 Gemini 的初始內容
    const contents = [
      ...history,
      { role: "user", parts: [{ text: `${ragPrompt}\n\n使用者問題：${message}` }] }
    ];

    // --- 2. 【第一次呼叫：詢問 Gemini 是否需要工具】 ---
    const result = await callWithRetry(async () => {
      return await model.generateContent({
        contents: contents,
        tools: agentTools
      });
    });

    const response = result.response;
    const candidate = response.candidates?.[0];
    const functionCallPart = candidate?.content?.parts?.find(p => p.functionCall);

    let finalOutput = "";

    // --- 3. 【判定是否觸發 Function Calling】 ---
    if (functionCallPart) {
      const { name, args } = functionCallPart.functionCall;
      const toolArgs = { ...args, userId: userId };

      console.log(`🚀 執行工具: ${name}`, toolArgs);
      const toolResult = await getBloodPressureData(toolArgs);

      // --- 4. 【第二次呼叫：把工具結果餵回 Gemini】 ---
      const finalResult = await callWithRetry(async () => {
        return await model.generateContent({
          contents: [
            ...contents,
            { role: "model", parts: [functionCallPart] }, // 必須包含模型剛才的請求
            {
              role: "function", // 標註為功能回傳
              parts: [{
                functionResponse: {
                  name: name,
                  response: { content: toolResult }
                }
              }]
            }
          ],
          tools: agentTools
        });
      });

      finalOutput = finalResult.response.text();
    } else {
      finalOutput = response.text();
    }

    // --- 5. 【更新記憶體】 ---
    // 記憶體內只存「純淨」的對話，不包含 RAG Prompt，避免記憶體膨脹且干擾後續判斷
    history.push({ role: "user", parts: [{ text: message }] });
    history.push({ role: "model", parts: [{ text: finalOutput }] });

    chatHistoryMap.set(userId, history.slice(-10)); // 保持最近 10 次對話

    res.json({ text: finalOutput });

  } catch (error) {
    console.error("❌ 錯誤詳情:", error);
    if (error.status === 429) {
      return res.status(429).json({ text: "系統忙碌中，請稍後再試。" });
    }
    res.status(500).json({ text: "伺服器暫時無法回應。" });
  }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🛡️ 伺服器啟動於埠號 http://localhost:${PORT}`));

