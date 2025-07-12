
const express = require('express')
const { GoogleGenAI } = require('@google/genai');
const cors = require('cors');
const e = require('express');
const { send } = require('process');
require("dotenv").config({ path: '../.env' });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_AI_KEY });
console.log('GoogleGenAI initialized with API key:', process.env.GEMINI_AI_KEY);

const groundingTool = {
  googleSearch: {},
};
const config = {
  tools: [groundingTool],
};

const GEMINI_FLASH = "gemini-2.5-flash"; // 인덱스 추출 등 더 복잡한 작업을 위해 최신 Flash 모델 권장
const GEMINI_PRO = "gemini-2.5-pro";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 4000;

const sendSseError = (res, message, error) => {
  console.error(message, error);
  res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
  res.write(`data: ${JSON.stringify({ event: 'done' })}\n\n`);
  res.end();
};

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
 * 수정 대상 세그먼트의 앞뒤 맥락을 제공합니다. (replace 방식용)
 * @param {string} fullText - 전체 원본 텍스트.
 * @param {string} segment - 수정 대상 텍스트 세그먼트.
 * @param {number} [contextLength=100] - 앞뒤로 가져올 맥락의 글자 수.
 * @returns {{context_before: string, context_after: string} | null} 맥락 또는 세그먼트를 찾지 못하면 null.
 */
function getContextualSnippets(fullText, segment, contextLength = 100) {
  const startIndex = fullText.indexOf(segment);
  if (startIndex === -1) {
    // 세그먼트를 찾지 못한 경우 (이전 수정으로 인해 텍스트가 변경된 경우)
    return null;
  }
  const endIndex = startIndex + segment.length;

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
  // --- 1단계: 종합 분석 및 진단 ---
  console.log("1단계: 텍스트 분석 및 진단 시작...");
  let analysisData, diagnosticsList;
  try {
    const result = await ai.models.generateContent({ model: GEMINI_FLASH, contents: stage1Prompt(userText) });
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
    console.log(`1단계 완료: ${diagnosticsList.length}개의 수정 항목 발견.`, result.text);
    res.write(`data: ${JSON.stringify({ diagnostics: diagnosticsList })}\n\n`);
    res.write(`data: ${JSON.stringify({ process: '1' })}\n\n`);

  } catch (error) {
    sendSseError(res, "1단계 분석 중 오류 발생", error)
    throw error;
  }


  // --- 2단계: 맥락 기반 수정안 생성 (순차적 replace) ---
  console.log("2단계: 수정안 순차적 생성 시작...");
  // 수정 과정을 추적할 변수. let으로 선언하여 계속 업데이트.
  let currentText = userText;

  const refinementPromises = diagnosticsList.map(item => {
    const context = getContextualSnippets(currentText, item.original_text_segment);
    // 만약 이전 수정으로 인해 원본 세그먼트를 더 이상 찾을 수 없다면, 이번 수정은 건너뜀
    if (!context) {
      console.warn(`세그먼트를 찾을 수 없어 수정을 건너뜁니다: "${item.original_text_segment}"`);
      return { ...item, rewritten: item.original_text_segment };
    }

    const prompt = getStage2Prompt(analysisData, item, context);

    try {
      return ai.models.generateContent({ model: GEMINI_PRO, contents: prompt })
        .then(result => {
          const parsed = parseJsonResponse(result.text);
          if (!parsed || !parsed.final_rewritten_text) {
            console.warn("2단계 수정안 파싱 실패, 원본 유지:", item.original_text_segment);
            // 파싱 실패 시 원본을 그대로 사용하도록 객체 반환
            return { ...item, rewritten: item.original_text_segment };
          }
          res.write(`data: ${JSON.stringify({ data: { original: item.original_text_segment, rewritten: parsed.final_rewritten_text } })}\n\n`);
          return { ...item, rewritten: parsed.final_rewritten_text };
        });
    } catch (error) {
      console.error(`세그먼트 수정 중 오류 발생: "${item.original_text_segment}"`, error);
      // 특정 항목에서 오류가 나더라도 전체 프로세스가 멈추지 않도록 계속 진행
    }
  })

  const refinementResult = await Promise.all(refinementPromises);

  refinementResult.forEach(refine => {
    if (refine?.rewritten) {
      const originalSegment = refine.original_text_segment;
      const rewrittenSegment = refine.rewritten;

      currentText = currentText.replace(originalSegment, rewrittenSegment);

    } else {
      console.warn("2단계 수정안 파싱 실패, 원본 유지:", item.original_text_segment);
    }
  })

  res.write(`data: ${JSON.stringify({ process: '2' })}\n\n`);
  console.log("2단계 완료: 최종 텍스트 조립 완료.");
  return currentText; // 모든 수정이 순차적으로 적용된 최종 텍스트   
}


// --- 개선된 Express 엔드포인트 ---
// SSE 로직을 더 명확하게 분리하고 에러 처리를 강화
app.post('/api/rewrite', async (req, res) => {
  const { inputText, clientId } = req.body;

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

    if(clientId){
      recordTokenUsage(clientId, inputText.length+finalText.length);
    }
  } catch (error) {
    console.error('글쓰기 개선 프로세스 중 최종 오류:', error.message);
    sendSseMessage({ event: 'error', message: error.message || '알 수 없는 오류가 발생했습니다.' });
  } finally {
    res.end();
  }
});

/**
 * 1단계: 개요 생성을 위한 프롬프트를 생성합니다.
 * AI가 웹 검색을 통해 사실 기반의 체계적인 개요를 JSON 형식으로 만들도록 지시합니다.
 * @param {string} raw_text - 사용자가 입력한 글의 주제 또는 핵심 아이디어
 * @param {string} format - 글의 용도 (예: "칼럼", "블로그 포스트")
 * @returns {string} - 개요 생성을 위한 AI 프롬프트
 */
function createOutlinePrompt(raw_text, format) {
  return `
    You are an expert content strategist and researcher named 'Architect'.
    Your task is to create a comprehensive, logical, and well-structured outline for an article based on the user's request.
    To ensure accuracy and depth, you MUST use web search to gather relevant, up-to-date information.

    **Article Request:**
    - Core Idea: "${raw_text}"
    - Format: "${format}"

    **Execution Plan:**
    1.  **Research:** Perform web searches to understand the topic, find key facts, arguments, and supporting data.
    2.  **Structure:** Organize the researched information into a logical flow (Introduction, Body Paragraphs, Conclusion).
    3.  **Output:** Present the final plan as a single, valid JSON object. The structure must be clear and easy for another writer to follow.

    **JSON Output Structure (Strictly Adhere to this):**
    Your entire output MUST be a single JSON object inside a \`\`\`json code block.

    \`\`\`json
    {
      "title": "A compelling and relevant title for the article",
      "outline": [
        {
          "type": "introduction",
          "title": "서론: 독자의 흥미를 끄는 시작",
          "description": "글의 주제를 소개하고, 독자가 왜 이 글을 읽어야 하는지에 대한 핵심 질문이나 흥미로운 사실을 제시합니다."
        },
        {
          "type": "body",
          "title": "본론 1: 첫 번째 핵심 주장 또는 정보",
          "description": "첫 번째 주요 포인트를 설명합니다. 포함할 구체적인 데이터, 예시, 또는 논거를 요약합니다."
        },
        {
          "type": "body",
          "title": "본론 2: 두 번째 핵심 주장 또는 정보",
          "description": "두 번째 주요 포인트를 설명합니다. 첫 번째 본론과 자연스럽게 연결되도록 구성합니다."
        },
        // (Add more body sections as needed based on the topic's complexity)
        {
          "type": "conclusion",
          "title": "결론: 내용 요약 및 마무리",
          "description": "글의 핵심 내용을 요약하고, 독자에게 전달하고 싶은 최종 메시지나 행동 촉구를 제시하며 마무리합니다."
        }
      ]
    }
    \`\`\`
  `;
}

/**
 * 2단계: 확정된 개요를 바탕으로 본문 작성을 위한 프롬프트를 생성합니다.
 * AI가 주어진 구조와 톤앤매너에 따라 완성된 글을 스트리밍으로 작성하도록 지시합니다.
 * @param {object} finalizedOutline - 사용자가 확정한 개요 JSON 객체
 * @param {number} expertiseLevel - 전문성 수준 (1-5)
 * @param {number} textLength - 글 길이 (1-5)
 * @param {number} textTone - 톤앤매너 (1-5)
 * @returns {string} - 본문 생성을 위한 AI 프롬프트
 */
function createBodyFromOutlinePrompt(finalizedOutline, expertiseLevel, textLength, textTone) {
    const expertiseMap = { 1: "Childlike simplicity", 2: "Beginner level", 3: "General audience", 4: "Informed audience", 5: "Expert level" };
    const lengthMap = { 1: "Very short (~100 words)", 2: "Short (~200 words)", 3: "Medium (~500 words)", 4: "Long (~800 words)", 5: "Very long (1200+ words)" };
    const toneMap = { 1: "Emotional & Sincere", 2: "Witty & Humorous", 3: "Friendly & Casual (-해요 체)", 4: "Professional & Persuasive (-습니다 체)", 5: "Objective & Informative (-다 체)" };

    // 개요 객체를 문자열로 변환하여 프롬프트에 삽입
    const outlineString = JSON.stringify(finalizedOutline, null, 2);

    return `
    You are a professional writer named 'Weaver'. Your task is to write a complete, high-quality article based *strictly* on the provided outline.

    **Writing Guidelines:**
    - Expertise: "${expertiseMap[expertiseLevel]}"
    - Approximate Length: "${lengthMap[textLength]}"
    - Tone & Manner: "${toneMap[textTone]}"

    **Article Blueprint (MUST Follow This Structure):**
    \`\`\`json
    ${outlineString}
    \`\`\`

    **Execution Instructions:**
    - Write the full article by fleshing out each section from the blueprint.
    - Ensure smooth transitions between paragraphs.
    - Strictly adhere to all guidelines (Expertise, Length, Tone).
    - **Your output MUST be ONLY the final article text in plain Korean.**
    - Do NOT include the title, section headers (like "서론:"), or any other metadata in your response. Just write the flowing content of the article.
  `;
}

/**
 * 1단계: 개요 생성 API
 * 사용자의 주제를 받아 AI가 분석 및 웹 검색 후 글의 개요를 JSON으로 반환합니다.
 */
app.post('/api/draft/outline', async (req, res) => {
    const { inputText, clientId, activeWritingType } = req.body;

    if (!inputText) {
        return res.status(400).json({ error: 'inputText (주제) is required' });
    }
    console.log(`[1단계] 개요 생성 요청 수신: ${inputText}`);

    try {
        const prompt = createOutlinePrompt(inputText, activeWritingType);

        // 개요 생성은 스트리밍이 아닌, 완전한 JSON 객체를 받아야 함
        const result = await ai.models.generateContent({
            model: GEMINI_PRO, // 개요 생성은 논리적 구조화가 중요하므로 PRO 모델 권장
            contents: prompt,
            tools: [groundingTool],
        });

        const parsedOutline = parseJsonResponse(result.text);

        if (!parsedOutline || !parsedOutline.outline) {
            console.error("개요 생성 실패 또는 AI 응답 파싱 실패:", result.text);
            return res.status(500).json({ error: 'Failed to generate a valid outline from AI.' });
        }

        console.log(`[1단계] 개요 생성 완료. 클라이언트로 전송.`);
        res.status(200).json(parsedOutline);

        // 토큰 사용량 기록 (입력값 기준)
        if (clientId) {
            recordTokenUsage(clientId, inputText.length);
        }

    } catch (error) {
        console.error('개요 생성 중 오류 발생:', error);
        res.status(500).json({ error: 'An error occurred while generating the outline.' });
    }
});


/**
 * 2단계: 본문 생성 API (스트리밍)
 * 클라이언트가 수정/확정한 개요(JSON)를 받아 AI가 본문을 스트리밍으로 작성합니다.
 */
app.post('/api/draft/generate', async (req, res) => {
    const { finalizedOutline, clientId, expertiseLevel, textLength, textTone } = req.body;
    
    if (!finalizedOutline || !Array.isArray(finalizedOutline.outline)) {
        return res.status(400).json({ error: 'finalizedOutline (개요) is required in the correct format.' });
    }
    console.log(`[2단계] 확정된 개요 기반 본문 생성 요청 수신.`);

    // 1. SSE(Server-Sent Events)를 위한 HTTP 헤더 설정
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    try {
        const prompt = createBodyFromOutlinePrompt(finalizedOutline, expertiseLevel, textLength, textTone);
        
        const responseStream = await ai.models.generateContentStream({
            model: GEMINI_FLASH, // 본문 작성은 속도가 중요하므로 Flash 모델 권장
            contents: prompt,
        });

        let fullText = '';
        for await (const chunk of responseStream) {
            const textChunk = chunk.text;
            if (textChunk) {
                fullText += textChunk;
                // 스트리밍으로 텍스트 조각 전송
                res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
            }
        }
        
        // 스트리밍 완료 메시지 전송
        res.write(`data: ${JSON.stringify({ event: 'done' })}\n\n`);
        console.log(`[2단계] 본문 스트리밍 완료.`);

        // 토큰 사용량 기록 (최종 생성된 텍스트 기준)
        if(clientId){
            recordTokenUsage(clientId, fullText.length);
        }
        
    } catch (error)
    {
        sendSseError(res, 'AI 본문 생성 중 오류가 발생했습니다', error);
    } finally {
        res.end(); // 스트림 연결 종료
    }
});

const stage1Prompt = (userText) => `
    You are 'Hae-an' (혜안), a top-tier AI Korean writing consultant and diagnostician. Your core philosophy is to empower writers by providing sharp, insightful analysis, not to simply rewrite their work.

    Your sole task is to analyze the provided Korean text and produce a detailed diagnostic report in a strict JSON format. **You MUST NOT suggest corrections or alternative phrasings.** Your role is to be a precise diagnostician, like a doctor identifying a problem, not a surgeon performing the operation.

    **Text to Analyze:**
    """
    ${userText}
    """

    ### Execution Process
    1.  **Holistic Analysis (1st Pass):** First, read the entire text to grasp its context. From this, derive the 'analysis' part of the JSON output, which includes identifying the topic, purpose, tone, and summarizing the core message.

    2.  **Micro-level Diagnosis (2nd Pass):** Next, re-read the text line-by-line. Meticulously identify specific segments with issues. For each issue, create a diagnostic object with the following precise criteria.

    ### JSON Output Structure
    Your entire output must be a single, valid JSON object.

    {
      "analysis": {
        "topic": "A concise description of the text's main subject.",
        "purpose": "The inferred primary goal (e.g., '정보 전달', '설득', '감성 전달').",
        "tone_and_manner": "The overall style (e.g., '학술적', '일상적', '전문적').",
        "core_message": "A one-sentence summary of the text's main point."
      },
      "diagnostics": [
        {
          "issue_type": "MUST be one of the following: '어색한 표현', '문법 오류', '의미 불명확', '논리/흐름', '어휘 부적절'",
          "original_text_segment": "The exact text segment with the issue.",
          "reasoning": "A specific and professional explanation of *why* it is an issue. For example, instead of just 'awkward', write '번역체 표현으로, 주어와 서술어의 거리가 멀어 부자연스러움' (Awkward due to translation style; the distance between subject and predicate is unnatural)."
        }
        //... more diagnostic objects if needed
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

/**
 * [최종 버전 - Grounding 적용] 사용자의 입력을 기반으로 AI 초안 생성 프롬프트를 생성합니다.
 * AI가 웹 검색을 통해 사실 기반의 글을 작성하고, 출력은 오직 'draft'만 포함합니다.
 * @param {string} raw_text - 사용자가 입력한 주제가 담긴 핵심 글
 * @param {string} format - 글의 용도 (예: "칼럼", "일상/블로그")
 * @param {number} expertise_level - 전문성 수준 (0-4)
 * @param {number} length - 글 길이 (0-4)
 * @param {number} tone - 톤앤매너 (0-4)
 * @returns {string} - AI API에 전송할 완성된 프롬프트 문자열
 */
function createDraftPrompt(raw_text, format, expertise_level, length, tone) {
  // 1. 숫자 입력을 텍스트 지침으로 변환 (매핑은 이전과 동일)
  const expertiseMap = {
    1: "Childlike simplicity (아주 쉬운 단어, 짧은 문장)",
    2: "Beginner level (전문용어 사용 금지 또는 즉시 설명)",
    3: "General audience (기본 지식 가정, 기술적 세부사항 회피)",
    4: "Informed audience (업계 용어 적절히 사용)",
    5: "Expert level (정확하고 기술적인 언어, 심층 분석)",
  };
  const lengthMap = {
    1: "Very short (1-2 paragraphs, ~100 words)",
    2: "Short (2-3 paragraphs, ~200 words)",
    3: "Medium (4-6 paragraphs, ~500 words)",
    4: "Long (7-10 paragraphs, ~800 words)",
    5: "Very long (10+ paragraphs, 1200+ words)",
  };
  const toneMap = {
    1: "Emotional & Sincere",
    2: "Witty & Humorous",
    3: "Friendly & Casual (-해요 체)",
    4: "Professional & Persuasive (-습니다 체)",
    5: "Objective & Informative (-다 체)",
  };

  // 2. 변환된 텍스트를 포함하여 최종 프롬프트 생성
  return `Guidelines
    Core Idea: "${raw_text}"
    Format: "${format}"
    Expertise: "${expertiseMap[expertise_level]}"
    Length: "${lengthMap[length]}"
    Tone: "${toneMap[tone]}"

    Execution Plan
    Research & Outline: To ensure the content is factual, current, and deep, you MUST perform web searches. Based on the research, create a silent, internal logical structure for the article.
    Draft: Write the full article text. Synthesize the researched information with the Core Idea. Strictly adhere to all Expertise, Length, and Tone guidelines.

    Final Output (Plain Text Format)
    You MUST output the article draft as plain text and nothing else.
    Do not include any introductory text or metadata.
    Do not include sources.
    Your entire response should be only the article content itself. Use standard paragraph breaks.
    `;
}

// --- Token usage tracking (in-memory, for demo) ---
const tokenUsageByClient = {};

function recordTokenUsage(clientId, inputTokenCount) {
  if (!clientId) return;
  if (!tokenUsageByClient[clientId]) {
    tokenUsageByClient[clientId] = 0;
  }
  tokenUsageByClient[clientId] += inputTokenCount;
  console.log(`Token usage for ${clientId}: ${tokenUsageByClient[clientId]}`);
}

app.listen(PORT, () => {
  console.log(`AI 글쓰기 서버가 http://34.64.230.31:${PORT}/generate-text 에서 실행 중입니다.`);
});