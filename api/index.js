
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
 * 사용자의 한국어 초고를 입력받아, 2단계 AI 프로세스를 거쳐 개선된 최종본을 반환합니다.
 * 1단계: Gemini Flash 모델로 텍스트 전체를 분석하고 수정 대상을 진단합니다.
 * 2단계: Gemini Pro 모델로 각 수정 대상에 대해 병렬적으로 개선안을 생성합니다.
 *
 * @param {string} userText 사용자가 입력한 한국어 초고.
 * @returns {Promise<string>} AI가 수정한 최종 결과물 텍스트.
 */
async function improveKoreanText(userText) {
  // --- 모델 정의 ---
  // 1단계 (빠른 분석용)
  const analysisModel = "gemini-2.5-flash";
  // 2단계 (고품질 생성용)
  const refinementModel = "gemini-2.5-pro";

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
    You are a world-class Korean linguist and professional editor. Your task is to rewrite a single text segment to perfection by following a structured reasoning process.

    **1. Context from Overall Document Analysis:**
    - Topic: ${analysis.topic}
    - Tone: ${analysis.tone_and_manner}
    - Purpose: ${analysis.purpose}

    **2. Segment to Improve:**
    - Original Text (Korean): "${diagnosticItem.original_text_segment}"
    - Identified Issue: "${diagnosticItem.issue_type}"

    **3. Your Task: Structured Reasoning and Refinement**
    Follow these steps internally. Your final output must be a single JSON object containing only your reasoning_steps and the final_rewritten_text.

    **4. Final Output Format:**
    Provide your response as a single JSON object with the following keys. Do not add any text outside of the JSON structure.
    {
      "reasoning_steps": {
        "step_1_principle": "Your analysis from Step 1.",
        "step_2_first_draft": "Your draft from Step 2.",
        "step_3_critique": "Your critique from Step 3.",
        "step_4_final_version_reasoning": "A brief note on what you improved from the draft to the final version."
      },
      "final_rewritten_text": "The polished Korean text from Step 4."
    }`;

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
    console.log(`1단계 완료: ${diagnosticsList.length}개의 수정 대상 발견.`);
  } catch (error) {
    console.error("1단계 API 호출 중 오류 발생:", error);
    throw new Error("Failed to analyze text or parse diagnostics.");
    return userText; // 오류 발생 시 원본 반환
  }

  // --- 2단계: 원칙 기반 자기 개선 생성 (병렬 처리) ---
  console.log("2단계: 개선안 생성 시작 (병렬 처리)...");
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

    const refinementResults = await Promise.all(refinementPromises);
    console.log("2단계 완료: 모든 개선안 생성 완료.");

    // --- 최종 결과물 조립 ---
    let finalText = userText;
    refinementResults.forEach(res => {
      // 원본 텍스트에서 수정 대상을 찾아 교체합니다.
      finalText = finalText.replace(res.original, res.rewritten);
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

    res.write(`data: ${JSON.stringify({ process: '2' })}\n\n`);
    improveKoreanText(input)
      .then(finalText => {
        res.write(`data: ${JSON.stringify({ event: 'done' })}\n\n`);
        res.write(`data: ${JSON.stringify({ text: finalText })}\n\n`);
        res.end();
      })

  } catch (error) {
    sendSseError(res, 'AI 글쓰기 생성 중 오류가 발생했습니다', error);
  }
});

// AI 글쓰기 스트리밍을 위한 엔드포인트 (이건 이제 간단 초안작성 기능으로 변경하기)
app.post('/api/generate', async (req, res) => {
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

    // 2. [개선] 기획 단계 (분석, 페르소나, 조사항목 통합)
    let planningPrompt = `주어질 글 작성 요구사항을 분석하여, 다음 키(key)를 가진 JSON 형식으로만 응답하세요:
                        - "topic": 글의 주제
                        - "goal": 글의 목표
                        - "persona": 글을 작성할 가장 적합한 전문가 직업 (단 하나)
                        - "research_topics": 주제에 대해 조사해야 할 구체적인 항목 리스트 (배열 형태)

                        파악 불가 시 "없음"으로 표기하고, research_topics는 100자 이내로 요약하세요.

                        요구사항: ${input}`;
    const planningResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite-preview-06-17",
        contents: planningPrompt,
    });

    //console.log('Planning Response:', planningResponse.text);
    let planningData = [];
    try {
      planningData = JSON.parse(planningResponse.text.replaceAll("`", "").replace("json", ""));
    } catch (error) {
      sendSseError(res, '계획단계에서 JSON포맷 오류가 발생하였습니다', error);
      return;
    }
    res.write(`data: ${JSON.stringify({ process: '2' })}\n\n`);

    // 3. [개선] 자료 조사 단계
    const detailPrompt = `당신은 전문 리서처입니다. 다음 조사 항목들에 대한 '객관적인 최신 통계 또는 사실 정보'를 찾아 종합하여 300자 이내로 요약하세요.
                          조사 항목: ${planningData.research_topics.join(', ')}`;
                         
    const detailResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite-preview-06-17",
      contents: detailPrompt,
      config
    });
    res.write(`data: ${JSON.stringify({ process: '3' })}\n\n`);
    //console.log('Detail Response:', detailResponse.text);

    const detailTextWithCitations = addCitations(detailResponse);
    const chunks = detailResponse.candidates[0]?.groundingMetadata?.groundingChunks;
    if (chunks && chunks.length > 0) {
      res.write(`data: ${JSON.stringify({ source: chunks })}\n\n`);
    }

    // 4. [개선] 본문 초안 작성 단계
    let writePrompt = `당신은 '${planningData.persona}' 전문가 입니다.
                      주어질 아래의 지시와 관련 정보를 토대로 글을 작성하세요.
                      관련 정보에 포함된 '[숫자]' 형식의 출처 표기는 반드시 유지해야 합니다. 그 외 불필요한 특수문자 사용은 지양하세요.
                      당신은 ${expertiseLevel} 수준(${expertiseLevel === 1 ? '일상적' : '전문가'})의 전문성으로 글을 작성합니다.
                      글의 길이는 ${textLength} 수준(${textLength === 1 ? '짧게' : '길게'})으로 작성합니다.
                      가능한 단어의 중복 사용은 피하고, 본인을 소개하지 마세요.

                      지시: 주제는 '${planningData.topic}', 목표는 '${planningData.goal}' 입니다.
                      관련 정보: ${detailTextWithCitations}`;

    const writeResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: writePrompt,
    });
    res.write(`data: ${JSON.stringify({ process: '4' })}\n\n`);
    console.log('Write Response:', writeResponse.text);

    // 5. [개선] 피드백 및 퇴고 단계
    let feedbackPrompt = `당신은 최고의 편집자입니다. 아래 '원본 글'을 다음 '수정 지침'에 맞게 완성도 높게 다듬어 주세요.
                          [수정 지침]
                          1. 톤앤매너: ${textTone} 수준의 ${textTone > 3 ? '공식적인' : '친근한'} 어조로 변경하세요. (1=친근, 5=공식)
                          2. 논리성 및 가독성: 글의 논리적 흐름을 강화하고, 문장을 더 자연스럽고 읽기 쉽게 만드세요.
                          3. 출처 유지: 원본 글에 있는 '[숫자]' 형식의 출처 표기는 절대 삭제하거나 변경하지 마세요.

                          [결과물 형식]
                          - 서론, 본론, 결론과 같은 부가적인 설명 없이 오직 완성된 글만 출력하세요. 강조표시는 하지 않습니다.

                          [원본 글]
                          ${writeResponse.text}`;

    const feedbackResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: feedbackPrompt,
    });
    res.write(`data: ${JSON.stringify({ process: '5' })}\n\n`);

    // 6. 최종 결과물 전송 및 스트림 종료
    res.write(`data: ${JSON.stringify({ text: feedbackResponse.text })}\n\n`);
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