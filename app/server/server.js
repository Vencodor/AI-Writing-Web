
const express = require('express')
const { GoogleGenAI } = require('@google/genai');
const cors = require('cors');
const e = require('express');
const { send } = require('process');
require("dotenv").config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_AI_KEY });

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

// AI 글쓰기 스트리밍을 위한 엔드포인트
app.post('/generate-text', async (req, res) => {
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
    console.log('Detail Response:', detailResponse.text);

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
    //console.log('Write Response:', writeResponse.text);

    // 5. [개선] 피드백 및 퇴고 단계
    let feedbackPrompt = `당신은 최고의 편집자입니다. 아래 '원본 글'을 다음 '수정 지침'에 맞게 완성도 높게 다듬어 주세요.
                          [수정 지침]
                          1. 톤앤매너: ${textTone} 수준의 ${textTone > 3 ? '공식적인' : '친근한'} 어조로 변경하세요. (1=친근, 5=공식)
                          2. 논리성 및 가독성: 글의 논리적 흐름을 강화하고, 문장을 더 자연스럽고 읽기 쉽게 만드세요.
                          3. 출처 유지: 원본 글에 있는 '[숫자]' 형식의 출처 표기는 절대 삭제하거나 변경하지 마세요.

                          [결과물 형식]
                          - 서론, 본론, 결론과 같은 부가적인 설명 없이 오직 완성된 글만 출력하세요.

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
  console.log(`AI 글쓰기 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});