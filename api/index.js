
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
 * @typedef {object} Diagnostic
 * @property {string} issue_type - The category of the issue (e.g., 'Grammar', 'Clarity').
 * @property {string} original_text_segment - The exact text segment with the issue.
 * @property {number} start_index - The starting character index of the segment in the original text.
 * @property {number} end_index - The ending character index of the segment.
 * @property {string} reasoning - A brief explanation of why this segment needs improvement.
 */

/**
 * @typedef {object} Refinement
 * @property {string} original - The original text segment.
 * @property {string} rewritten - The rewritten, improved text segment.
 * @property {number} start_index - The starting character index.
 * @property {number} end_index - The ending character index.
 */


// --- Helper Functions ---
/**
 * AI 응답에서 JSON 객체만 안전하게 추출합니다.
 * @param {string} text - AI 모델이 반환한 텍스트.
 * @returns {object | null} 파싱된 JSON 객체 또는 실패 시 null.
 */
function parseJsonResponse(text) {
  try {
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```|({[\s\S]*})/);
    if (!jsonMatch) {
      console.warn("응답에서 JSON을 찾지 못했습니다:", text);
      return null;
    }
    // 첫 번째 또는 두 번째 캡처 그룹에서 유효한 JSON 문자열을 사용합니다.
    const jsonString = jsonMatch[1] || jsonMatch[2];
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("JSON 파싱 오류:", error, "원본 텍스트:", text);
    return null; // 파싱 실패 시 null 반환
  }
}

/**
 * 수정 대상 세그먼트의 앞뒤 맥락을 제공하는 함수
 * @param {string} fullText - 전체 원본 텍스트.
 * @param {number} startIndex - 수정 대상 세그먼트의 시작 인덱스.
 * @param {number} endIndex - 수정 대상 세그먼트의 끝 인덱스.
 * @param {number} [contextLength=100] - 앞뒤로 가져올 맥락의 글자 수.
 * @returns {{context_before: string, context_after: string}}
 */
function getContextualSnippets(fullText, startIndex, endIndex, contextLength = 100) {
  const context_before = fullText.substring(Math.max(0, startIndex - contextLength), startIndex);
  const context_after = fullText.substring(endIndex, Math.min(fullText.length, endIndex + contextLength));
  return { context_before, context_after };
}


// --- 개선된 메인 함수 ---
/**
 * 사용자의 한국어 초고를 입력받아, 맥락을 고려한 2단계 AI 프로세스를 거쳐 개선된 최종본을 반환합니다.
 * @param {string} userText 사용자가 입력한 한국어 초고.
 * @param {object} res - Express의 Response 객체 (SSE 스트리밍용).
 * @returns {Promise<string>} AI가 수정한 최종 결과물 텍스트.
 */
async function improveKoreanText(userText, res) {
  // --- 모델 정의 ---
  const analysisModel = "gemini-2.5-pro"; // 인덱스 추출 등 더 복잡한 작업을 위해 최신 Flash 모델 권장
  const refinementModel = "gemini-2.5-pro";

  // --- 개선점 1: 더 정교해진 1단계 프롬프트 ---
  // start_index, end_index, reasoning을 명시적으로 요구하여 진단의 질과 후처리 안정성을 높임
  const stage1Prompt = `
    You are an expert Korean editor. Your task is to analyze the provided Korean text and identify segments that need improvement.
    For each segment, provide its exact start and end character indices.

    **Focus on issues like:**
    - Awkward phrasing or unnatural expressions (번역체).
    - Grammatical errors (e.g., incorrect particles 조사).
    - Lack of clarity or ambiguity.
    - Poor flow or abrupt transitions.

    **Do not suggest corrections.** Your output must be a single JSON object.

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
          "issue_type": "The category of the issue (e.g., 'Awkward Phrasing', 'Grammar').",
          "original_text_segment": "The exact text segment with the issue.",
          "start_index": "The starting character index of the segment.",
          "end_index": "The ending character index of the segment.",
          "reasoning": "A brief explanation of why this segment is problematic."
        }
      ]
    }
    `;

  // --- 개선점 2: 맥락(Context)을 주입하는 2단계 프롬프트 ---
  // Chain-of-Thought와 주변 맥락을 제공하여 수정 퀄리티를 극대화
  const getStage2Prompt = (analysis, diagnosticItem, context) => `
    You are a world-class Korean linguist and professional editor. Your goal is to rewrite a single Korean text segment to perfection, considering its surrounding context.

    **1. Overall Document Context:**
      - Topic: ${analysis.topic}
      - Tone: ${analysis.tone_and_manner}
      - Purpose: ${analysis.purpose}

    **2. Segment to Improve:**
      - Context Before: "...${context.context_before}"
      - **Text to Rewrite: "${diagnosticItem.original_text_segment}"**
      - Context After: "${context.context_after}..."
      - Identified Issue: ${diagnosticItem.issue_type}
      - Reason for Improvement: ${diagnosticItem.reasoning}

    **3. Your Task: Follow this Chain of Thought to achieve the best result.**

    **Step 1: Problem Analysis:**
    Briefly analyze the problem of the "Text to Rewrite" based on the issue, reasoning, and its connection to the surrounding context.

    **Step 2: Draft & Refine:**
    Create one or two alternative drafts. For each, explain the improvement.
      - Draft 1: [Your first rewritten version]
      - Justification 1: [Why this draft is better]
      - Draft 2: [Your second rewritten version, if needed]
      - Justification 2: [Why this draft is better]

    **Step 3: Final Selection:**
    Choose the best draft and present it as the final answer in the required JSON format. The final text must fit seamlessly into the surrounding context.

    **4. Final Output:**
    Provide your response as a single JSON object with ONLY the 'final_rewritten_text' key.
    \`\`\`json
    {
      "final_rewritten_text": "The single best, polished Korean text segment."
    }
    \`\`\`
  `;

  // --- 1단계: 종합 분석 및 진단 ---
  console.log("1단계: 텍스트 분석 및 진단 시작...");
  let analysisData, diagnosticsList;
  try {
    const result = await ai.models.generateContent({ model: analysisModel, contents: stage1Prompt });
    const parsedResponse = parseJsonResponse(result.text);
    
    if (!parsedResponse || !parsedResponse.diagnostics) {
        throw new Error("1단계 분석 결과 파싱 실패");
    }

    analysisData = parsedResponse.analysis;
    diagnosticsList = parsedResponse.diagnostics;

    if (diagnosticsList.length === 0) {
      console.log("수정할 항목을 찾지 못했습니다. 원본 텍스트를 반환합니다.");
      // 스트리밍을 위해 완료 메시지 전송
      res.write(`data: ${JSON.stringify({ event: 'no_changes' })}\n\n`);
      return userText;
    }
    console.log(`1단계 완료: ${diagnosticsList.length}개의 수정 항목 발견.`);
    res.write(`data: ${JSON.stringify({ diagnostics: diagnosticsList })}\n\n`);

  } catch (error) {
    sendSseError(res, "1단계 분석 중 오류 발생", error)
    throw error;
  }

  // --- 2단계: 맥락 기반 수정안 생성 (병렬 처리) ---
  console.log("2단계: 수정안 병렬 생성 시작...");
  try {
    const refinementPromises = diagnosticsList.map(item => {
      const context = getContextualSnippets(userText, item.start_index, item.end_index);
      const prompt = getStage2Prompt(analysisData, item, context);
      
      return ai.models.generateContent({ model: refinementModel, contents: prompt })
        .then(result => {
          const parsed = parseJsonResponse(result.text);
          if (!parsed || !parsed.final_rewritten_text) {
             console.warn("2단계 수정안 파싱 실패, 원본 유지:", item.original_text_segment);
             // 파싱 실패 시 원본을 그대로 사용하도록 객체 반환
             return { ...item, rewritten: item.original_text_segment };
          }
          // SSE로 각 수정 사항 진행 상황 전송 가능
          res.write(`data: ${JSON.stringify({ rewritten: { original: item.original_text_segment, rewritten: parsed.final_rewritten_text } })}\n\n`);
          return { ...item, rewritten: parsed.final_rewritten_text };
        });
    });

    const refinementResults = await Promise.all(refinementPromises);

    // --- 개선점 3: 안정적인 텍스트 재조립 ---
    // 뒤에서부터 수정해야 인덱스가 꼬이지 않음. start_index를 기준으로 내림차순 정렬.
    refinementResults.sort((a, b) => b.start_index - a.start_index);

    let finalText = userText;
    refinementResults.forEach(refine => {
      finalText = 
        finalText.substring(0, refine.start_index) + 
        refine.rewritten + 
        finalText.substring(refine.end_index);
    });
    
    console.log("2단계 완료: 최종 텍스트 조립 완료.");
    return finalText;

  } catch (error) {
    console.error("2단계 API 호출 또는 결과 조립 중 오류 발생:", error);
    res.write(`data: ${JSON.stringify({ event: 'error', message: '2단계 수정안 생성 중 오류가 발생했습니다.' })}\n\n`);
    throw error;
  }
}


// --- 개선된 Express 엔드포인트 ---
// SSE 로직을 더 명확하게 분리하고 에러 처리를 강화
app.post('/api/rewrite', async (req, res) => {
  const { inputText } = req.body;

  if (!inputText) {
    return res.status(400).json({ error: 'inputText is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendSseMessage = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const finalText = await improveKoreanText(inputText, res);
    sendSseMessage({ event: 'done', text: finalText });
  } catch (error) {
    console.error('글쓰기 개선 프로세스 중 최종 오류:', error.message);
    sendSseMessage({ event: 'error', message: error.message || '알 수 없는 오류가 발생했습니다.' });
  } finally {
    res.end();
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