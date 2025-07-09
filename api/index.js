
const express = require('express')
const { GoogleGenAI } = require('@google/genai');
const cors = require('cors');
const e = require('express');
const { send } = require('process');
require("dotenv").config( {path: '../.env'} );

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_AI_KEY });
console.log('GoogleGenAI initialized with API key:', process.env.GEMINI_AI_KEY);

const groundingTool = {
  googleSearch: {},
};
const config = {
  tools: [groundingTool],
};

const app = express();
app.use(cors());
app.use(express.json()); // POST 요청의 body를 파싱하기 위해 필요

const PORT = 4000;

/**
 * 클라이언트에 SSE 형식으로 오류를 전송하고 연결을 종료합니다.
 * @param {object} res - Express 응답 객체
 * @param {string} message - 오류 메시지
 * @param {Error} error - 실제 오류 객체
 */
const sendSseError = (res, message, error) => {
    console.error(message, error);
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.write(`data: ${JSON.stringify({ event: 'done' })}\n\n`);
    res.end();
};


/**
 * 모델이 반환한 텍스트에서 JSON만 깔끔하게 추출하는 헬퍼 함수.
 * @param {string} rawText 모델의 응답 텍스트.
 * @returns {object} 파싱된 JSON 객체.
 */
const parseJsonResponse = (rawText) => {
  const match = rawText.match(/```json\n([\s\S]*?)\n```/);
  const jsonString = match ? match[1] : rawText;
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    console.error("JSON 파싱 실패:", e);
    console.error("원본 응답:", rawText);
    throw new Error("Failed to parse JSON response from model.");
  }
};

/**
 * 사용자의 한국어 초고를 입력받아, 2단계 AI 프로세스를 거쳐 개선된 최종본을 반환합니다.
 * 1단계: Gemini Flash 모델로 텍스트 전체를 분석하고 수정 대상을 진단합니다.
 * 2단계: Gemini Pro 모델로 각 수정 대상에 대해 병렬적으로 개선안을 생성합니다.
 *
 * @param {string} userText 사용자가 입력한 한국어 초고.
 * @returns {Promise<string>} AI가 수정한 최종 결과물 텍스트.
 */
async function improveKoreanText(userText, res) {
  // --- 모델 정의 ---
  // 1단계 (빠른 분석용)
  const analysisModel = "gemini-2.5-flash";
  // 2단계 (고품질 생성용)
  const refinementModel = "gemini-2.5-flash";

  // --- 프롬프트 템플릿 정의 ---
  const stage1Prompt = `
    You are a master editor with an exceptional eye for detail. Your task is to first perform a deep analysis of the provided text to understand its core essence, and then identify all segments that require improvement.
    Do not suggest any corrections. Your output must be a single JSON object.

    Text to Analyze:
    """
    ${userText}
    """

    **JSON Output Structure:**
    {
      "analysis": {
        "topic": "The main subject of the text.",
        "purpose": "The primary goal (e.g., 'inform', 'persuade').",
        "tone_and_manner": "The overall style (e.g., 'academic', 'casual').",
        "core_message": "A one-sentence summary of the main point."
      },
      "diagnostics": [
        {
          "issue_type": "The category of the issue (e.g., 'Grammar', 'Clarity', 'Flow', 'Awkward Phrasing').",
          "original_text_segment": "The exact text segment with the issue.",
          "line_number": "The line number where the segment starts."
        }
      ]
    }
    JSON Output:`;

  const getStage2Prompt = (analysis, diagnosticItem) => `
    You are a world-class Korean linguist and professional editor. Your task is to rewrite a  
    single text segment to perfection by following a structured reasoning process.
        
    **1. Context from Overall Document Analysis:**
      - Topic: ${analysis.topic}
      - Tone: ${analysis.tone_and_manner}
      - Purpose: ${analysis.purpose}
        
    **2. Segment to Improve:**
      - Original Text (Korean): "${diagnosticItem.original_text_segment}"
      - Identified Issue: "${diagnosticItem.issue_type}"
      
    **3. Your Task: Structured Reasoning and Refinement (Internal Process)**
    Internally, follow these steps to refine the text. Do not output these steps.
    - Step 1: Analyze the original text segment in the given context and identify the core
      problem based on the 'Identified Issue'.
    - Step 2: Draft a first version of the rewritten text, focusing on addressing the
        identified issue while maintaining the overall topic, tone, and purpose.
    - Step 3: Critically review the first draft for clarity, conciseness, naturalness, and
      adherence to Korean linguistic standards.
    - Step 4: Produce the final, polished version of the rewritten text, incorporating
          improvements from the critique.
      
    **4. Final Output Format:**
      Provide your response as a single JSON object with only the 'final_rewritten_text' key. 
      Do not add any text outside of the JSON structure.
      
    {
      "final_rewritten_text": "The polished Korean text."
      }
      
  `;

  // --- 1단계: 종합 분석 및 진단 ---
  console.log("1단계: 텍스트 분석 및 진단 시작...");
  let analysisData, diagnosticsList;
  try {
    const result = await ai.models.generateContent({
        model: analysisModel,
        contents: stage1Prompt,
    });
    const parsedResponse = parseJsonResponse(result.text);
    
    analysisData = parsedResponse.analysis;
    diagnosticsList = parsedResponse.diagnostics;

    if (!diagnosticsList || diagnosticsList.length === 0) {
      console.log("수정할 항목을 찾지 못했습니다. 원본 텍스트를 반환합니다.");
      return userText;
    }
    console.log(`1단계 완료: ${result.text}`);
  } catch (error) {
    console.error("1단계 API 호출 중 오류 발생:", error);
    throw new Error("Failed to analyze text or parse diagnostics.");
    return userText; // 오류 발생 시 원본 반환
  }

  res.write(`data: ${JSON.stringify({ diagnostics: diagnosticsList })}\n\n`)
  res.write(`data: ${JSON.stringify({ process: '1' })}\n\n`)

  // --- 2단계: 원칙 기반 자기 개선 생성 (병렬 처리) ---
  try {
    const refinementPromises = diagnosticsList.map(item => {
      const prompt = getStage2Prompt(analysisData, item);
      return ai.models.generateContent({
          model: refinementModel,
          contents: prompt,
        })
        .then(result => {
          const parsed = parseJsonResponse(result.text);
          return {
            original: item.original_text_segment,
            rewritten: parsed.final_rewritten_text
          };
        });
    });
    res.write(`data: ${JSON.stringify({ process: '2' })}\n\n`)

    const refinementResults = await Promise.all(refinementPromises);

    // --- 최종 결과물 조립 ---
    let finalText = userText;
    refinementResults.forEach(refine => {
      // 원본 텍스트에서 수정 대상을 찾아 교체합니다.
      console.log(`${JSON.stringify(refine)}`);
      finalText = finalText.replace(refine.original, refine.rewritten);
    });

    return finalText;

  } catch (error) {
    console.error("2단계 API 호출 또는 결과 조립 중 오류 발생:", error);
    throw new Error("Failed to generate or assemble refinement results.");
  }
}

// AI 글 개선 스트리밍을 위한 엔드포인트
app.post('/api/rewrite', async (req, res) => {
  // 사용자로부터 입력값 받기
  const input = req.body.inputText;
  const expertiseLevel = req.body.expertiseLevel / 1 + 1;
  const textLength = req.body.textLength / 1 + 1;
  const textTone = req.body.textTone / 1 + 1;

  console.log('Received input:', input, expertiseLevel, textLength, textTone);

  // 입력값 유효성 검사
  if (!input) {
    res.status(400).send('Error: prompt is required');
    return;
  }

  try {
    // 1. SSE(Server-Sent Events)를 위한 HTTP 헤더 설정
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    improveKoreanText(input, res)
      .then(finalText => {
        res.write(`data: ${JSON.stringify({ event: 'done' })}\n\n`);
        res.write(`data: ${JSON.stringify({ text: finalText })}\n\n`);
        res.end();
      })

  } catch (error) {
    sendSseError(res, 'AI 글쓰기 생성 중 오류가 발생했습니다', error);
  }
});

// AI 초안작성을 위한 스트리밍 사이트 (정보탐색, 적극적 글쓰기)
app.post('/api/draft', async (req, res) => {
  // 사용자로부터 입력값 받기
  const input = req.body.inputText;
  const expertiseLevel = req.body.expertiseLevel / 1 + 1;
  const textLength = req.body.textLength / 1 + 1;
  const textTone = req.body.textTone / 1 + 1;

  console.log('Received input:', input, expertiseLevel, textLength, textTone);

  // 입력값 유효성 검사
  if (!input) {
    res.status(400).send('Error: prompt is required');
    return;
  }

  try {
    // 1. SSE(Server-Sent Events)를 위한 HTTP 헤더 설정
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const prompt = `
  You are an AI assistant functioning as an expert writer.

  Your sole task is to generate a high-quality, well-structured article based on the user-provided topic:
  "${input}".


  To do this, you must perform web searches to gather current and factual information and then synthesize it
   into a complete article.


  Crucial instructions:
   1. No Markdown: You must not use any Markdown formatting (like ##, *, or **). The entire article must be
      plain text.
   2. Paragraphs: Use \\n to separate paragraphs.
   3. JSON Output: The final output must be a single, valid JSON object containing only one key: "draft". Do
      not include any other text or explanations before or after the JSON object.

  The JSON object must conform to the following schema:

   {
     "draft": "The full, plain-text content of the article goes here. Paragraphs are separated by
     \\n."
   }
    `
                         
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config
    });

    const parsedResponse = parseJsonResponse(response.text);

    const chunks = response.candidates[0]?.groundingMetadata?.groundingChunks;
    if (chunks && chunks.length > 0) {
      //res.write(`data: ${JSON.stringify({ source: chunks })}\n\n`); //이거 메인화면 연동해놓기
    }

    // 6. 최종 결과물 전송 및 스트림 종료
    res.write(`data: ${JSON.stringify({ text: parsedResponse })}\n\n`);
    res.write(`data: ${JSON.stringify({ event: 'done' })}\n\n`);
    res.end();

  } catch (error) {
    sendSseError(res, 'AI 글쓰기 생성 중 오류가 발생했습니다', error);
  }
});

//AI 글쓰기 인라인 인용
function addCitations(response) {
    let text = response.text;
    const supports = response.candidates[0]?.groundingMetadata?.groundingSupports || [];
    const chunks = response.candidates[0]?.groundingMetadata?.groundingChunks || [];

    // Sort supports by end_index in descending order to avoid shifting issues when inserting.
    const sortedSupports = [...supports].sort(
        (a, b) => (b.segment?.endIndex ?? 0) - (a.segment?.endIndex ?? 0),
    );

    for (const support of sortedSupports) {
        const endIndex = support.segment?.endIndex;
        if (endIndex === undefined || !support.groundingChunkIndices?.length) {
        continue;
        }

        const citationLinks = support.groundingChunkIndices
        .map(i => {
            const uri = chunks[i]?.web?.uri;
            if (uri) {
            return `[${i + 1}]`;
            }
            return null;
        })
        .filter(Boolean);

        if (citationLinks.length > 0) {
        const citationString = citationLinks.join(", ");
        text = text.slice(0, endIndex) + citationString + text.slice(endIndex);
        }
    }

    return text;
}

app.listen(PORT, () => {
  console.log(`AI 글쓰기 서버가 http://34.64.230.31:${PORT}/generate-text 에서 실행 중입니다.`);
});