"use client"

import React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { PenTool, Sparkles, ArrowLeft, ChevronDown, ChevronUp, CheckCircle, Copy, AlertTriangle, FileText, Send } from "lucide-react"
import Cookies from 'js-cookie';

import "./components.css" // 여기에 아래 CSS 코드를 추가해주세요.

// --- 타입 정의 및 상수 ---
type DraftingStage = 'idle' | 'fetchingOutline' | 'awaitingSubmit' | 'generatingBody';
const REWRITE_URL = "https://ai-writing-web.vercel.app/api/rewrite";
const DRAFT_OUTLINE_URL = "https://ai-writing-web.vercel.app/api/draft/outline";
const DRAFT_GENERATE_URL = "https://ai-writing-web.vercel.app/api/draft/generate";
const LOCAL_STORAGE_KEY = "ai_writer_recent_posts";
const MIN_REWRITE_LENGTH = 50;
const MIN_DRAFT_LENGTH = 10;

// --- 분리된 컴포넌트 ---
const ModernSlider = React.memo(({ label, value, onValueChange, labels }: { label: string; value: number[]; onValueChange: (value: number[]) => void; labels: string[] }) => (
  <div className="space-y-3">
    <div className="flex justify-between items-center"><Label className="font-semibold text-sm">{label}</Label><span className="text-xs text-gray-600 font-medium px-2 py-0.5 bg-gray-100 rounded-md">{labels[value[0]]}</span></div>
    <Slider value={value} onValueChange={onValueChange} max={labels.length - 1} step={1} className="w-full" />
  </div>
));
ModernSlider.displayName = 'ModernSlider';

const DynamicResultText = React.memo(({ text }: { text: string }) => {
  if (!text) return null;
  const lastPartLength = Math.min(10, Math.floor(text.length / 5));
  const mainPart = text.slice(0, -lastPartLength);
  const lastPart = text.slice(-lastPartLength);
  return <>{mainPart}<span className="text-gray-400">{lastPart}</span></>;
});
DynamicResultText.displayName = 'DynamicResultText';

const TruckLoader = () => (
    <div className="truck-wrapper"><div className="truck"><div className="truck-container"></div><div className="glases"></div><div className="bonet"></div><div className="base"></div><div className="base-aux"></div><div className="wheel-back"></div><div className="wheel-front"></div><div className="smoke"></div></div></div>
);

// --- 메인 컴포넌트 ---
export default function Component() {
  // --- 상태 관리 ---
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);
  const [inputText, setInputText] = useState("");
  const [originalInputText, setOriginalInputText] = useState("");
  const [activeWritingType, setActiveWritingType] = useState("blogPost");
  const [expertiseLevel, setExpertiseLevel] = useState([2]);
  const [textLength, setTextLength] = useState([2]);
  const [textTone, setTextTone] = useState([2]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState("");
  const [displayedText, setDisplayedText] = useState("");
  const [draftingStage, setDraftingStage] = useState<DraftingStage>('idle');
  const [draftOutline, setDraftOutline] = useState<any>(null);
  const [isTextAnimating, setIsTextAnimating] = useState(false);

  const textRef = useRef<HTMLTextAreaElement>(null);

  const sliderLabels = {
    expertise: ["일반", "초급", "중급", "고급", "전문가"],
    length: ["아주 짧게", "짧게", "중간", "길게", "아주 길게"],
    tone: ["감성적", "재치있는", "친근한", "전문적", "객관적"],
  };

  // --- useEffect 훅 ---
  useEffect(() => { let clientId = Cookies.get('clientId'); if (!clientId) { clientId = crypto.randomUUID(); Cookies.set('clientId', clientId, { path: '/', sameSite: 'lax', expires: 365 }); } }, []);

  useEffect(() => {
    if (!generatedText || isGenerating) return;
    setIsTextAnimating(true);
    let animationFrameId: number;
    let currentIndex = 0;
    const animate = () => {
      if (currentIndex < generatedText.length) {
        const nextChunkSize = Math.max(1, Math.floor(Math.random() * 8) + 2);
        const nextIndex = Math.min(currentIndex + nextChunkSize, generatedText.length);
        setDisplayedText(generatedText.slice(0, nextIndex));
        currentIndex = nextIndex;
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setIsTextAnimating(false);
      }
    };
    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [generatedText, isGenerating]);


  // --- 헬퍼 및 로직 함수 ---
  const formatOutlineForDisplay = useCallback((outlineData: any): string => {
    if (!outlineData?.title || !outlineData?.outline) return "개요 생성에 실패했습니다. 내용을 지우고 다시 시도해주세요.";
    const { title, outline } = outlineData;
    let formattedText = `# ${title}\n\n## 개요\n`;
    outline.forEach((item: any, index: number) => { formattedText += `${index + 1}. ${item.title}\n   - ${item.description}\n\n`; });
    return formattedText + "------------------------------------\n위 개요를 바탕으로 글을 생성합니다. 내용을 자유롭게 수정하거나, 바로 '개요 제출' 버튼을 눌러주세요.";
  }, []);

  const handleApiResponse = async (response: Response, onData: (data: any) => void) => {
    if (!response.ok || !response.body) throw new Error(`API 요청 실패: ${response.statusText}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n\n").filter(line => line.trim() !== "");
      for (const line of lines) {
        if (line.startsWith("data:")) {
          try { onData(JSON.parse(line.substring(5))); }
          catch (e) { console.warn("SSE 파싱 오류:", line); }
        }
      }
    }
  };

  const startProcessing = useCallback(async () => {
    setIsGenerating(true); setOriginalInputText(inputText); setGeneratedText("");
    try {
      const response = await fetch(REWRITE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputText, expertiseLevel, textLength, textTone, clientId: Cookies.get('clientId') }) });
      let finalGeneratedText = "";
      await handleApiResponse(response, (data) => {
        if (data.text) finalGeneratedText = data.text;
      });
      setGeneratedText(finalGeneratedText);
    } catch (error) {
      console.error("글 다듬기 오류:", error);
    } finally {
      setIsGenerating(false);
    }
  }, [inputText, expertiseLevel, textLength, textTone]);

  const handleFetchOutline = useCallback(async () => {
    setDraftingStage('fetchingOutline'); setInputText("AI가 글의 구조를 설계하고 있습니다. 잠시만 기다려주세요...");
    try {
      const response = await fetch(DRAFT_OUTLINE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputText: originalInputText, activeWritingType, clientId: Cookies.get('clientId') }) });
      if (!response.ok) throw new Error(`개요 생성 API 오류`);
      const outlineData = await response.json();
      setDraftOutline(outlineData); setInputText(formatOutlineForDisplay(outlineData)); setDraftingStage('awaitingSubmit');
    } catch (error) {
      console.error("개요 생성 중 오류:", error);
      setInputText(originalInputText); setDraftingStage('idle');
    }
  }, [originalInputText, activeWritingType, formatOutlineForDisplay]);

  const handleGenerateBody = useCallback(async () => {
    setDraftingStage('generatingBody');
    try {
      const response = await fetch(DRAFT_GENERATE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ finalizedOutline: draftOutline, clientId: Cookies.get('clientId'), expertiseLevel, textLength, textTone }) });
      let firstChunk = true;
      await handleApiResponse(response, (data) => {
        if (data.text) { if (firstChunk) { setInputText(data.text); firstChunk = false; } else { setInputText(prev => prev + data.text); } }
        if (data.event === 'done') return;
      });
    } catch (error) { console.error("본문 생성 중 오류:", error);
    } finally { setDraftingStage('idle'); setDraftOutline(null); }
  }, [draftOutline, expertiseLevel, textLength, textTone]);
  

  // --- 이벤트 핸들러 ---
  const createRipple = (event: React.MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    const circle = document.createElement("span");
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;
    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - button.getBoundingClientRect().left - radius}px`;
    circle.style.top = `${event.clientY - button.getBoundingClientRect().top - radius}px`;
    circle.classList.add("ripple");
    const existingRipple = button.getElementsByClassName("ripple")[0];
    if (existingRipple) existingRipple.remove();
    button.appendChild(circle);
  };
  
  const handleDraftButtonClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    createRipple(event);
    if (draftingStage === 'idle') {
      if (inputText.length < MIN_DRAFT_LENGTH) return;
      if (!activeWritingType) return;
      setOriginalInputText(inputText); handleFetchOutline();
    } else if (draftingStage === 'awaitingSubmit') {
      handleGenerateBody();
    }
  }, [draftingStage, inputText, activeWritingType, handleFetchOutline, handleGenerateBody]);

  const handleRewriteButtonClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    createRipple(event);
    if (isGenerating || inputText.length < MIN_REWRITE_LENGTH) return;
    setIsSubmitted(true); startProcessing();
  }, [isGenerating, inputText, startProcessing]);
  
  const handleReset = useCallback(() => {
    setIsSubmitted(false); setIsGenerating(false); setOriginalInputText(""); setGeneratedText("");
    setDisplayedText(""); setInputText(""); setIsTextAnimating(false);
    setDraftingStage('idle'); setDraftOutline(null);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = e.target; setInputText(value);
    if (textRef.current) { textRef.current.style.height = 'auto'; textRef.current.style.height = `${textRef.current.scrollHeight}px`; }
  };
  
  // --- 렌더링 변수 ---
  const getDraftButtonContent = useCallback(() => {
    switch (draftingStage) {
      case 'fetchingOutline': return { icon: <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25"></circle><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.75"></path></svg>, text: "개요 생성중..." };
      case 'awaitingSubmit': return { icon: <Send className="w-4 h-4" />, text: "개요 제출" };
      case 'generatingBody': return { icon: <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25"></circle><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.75"></path></svg>, text: "본문 작성중..." };
      default: return { icon: <FileText className="w-4 h-4 text-purple-500" />, text: "AI 초안 작성" };
    }
  }, [draftingStage]);
  
  const textareaClassName = [ "w-full resize-none transition-all duration-300 ease-in-out p-4 focus:ring-0 focus:ring-offset-0 font-light border rounded-lg focus:outline-none text-base border-gray-300", isSubmitted ? "min-h-[140px]" : "min-h-[200px]", (draftingStage === 'fetchingOutline' || draftingStage === 'generatingBody') && "textarea-highlight", ].filter(Boolean).join(" ");
  const draftButtonClassName = `px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 ease-in-out min-h-[40px] relative overflow-hidden flex items-center justify-center space-x-2 shadow-sm ${ (draftingStage === 'fetchingOutline' || draftingStage === 'generatingBody') ? "bg-gray-200 text-gray-500 cursor-not-allowed" : draftingStage === 'awaitingSubmit' ? "bg-blue-500 text-white hover:bg-blue-600" : "bg-gray-100 text-gray-800 hover:bg-gray-200" }`;
  
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <div className={`min-h-screen transition-all duration-300 ease-in-out ${isSubmitted ? "md:grid md:grid-cols-[360px_1fr] flex flex-col" : "grid grid-cols-1"}`}>
        <div className={`flex flex-col transition-all duration-300 ease-in-out overflow-y-auto bg-white ${isSubmitted ? "p-4 md:p-6 border-r border-gray-200" : "p-6 md:p-8 justify-center items-center"}`}>
            <div className={`flex flex-col w-full transition-all duration-300 ease-in-out ${isSubmitted ? "space-y-5 max-w-full" : "space-y-6 max-w-full lg:max-w-xl"}`}>
                <div className="flex items-center space-x-3"><a href="/" className="flex items-center justify-center w-10 h-10 bg-black rounded-lg flex-shrink-0"><PenTool className="w-5 h-5 text-white" /></a><div><h1 className="font-bold text-xl">AI Writer</h1><p className="text-sm text-gray-500">AI 글쓰기 도우미</p></div></div>
                
                <div className="space-y-3">
                  <Label htmlFor="content" className="font-semibold text-base">{draftingStage === 'awaitingSubmit' ? '개요를 확인 및 수정하세요' : '글 주제를 입력하세요'}</Label>
                  <Textarea id="content" value={inputText} onChange={handleInputChange} ref={textRef} disabled={draftingStage === 'fetchingOutline' || draftingStage === 'generatingBody'} className={textareaClassName} placeholder="블로그 포스팅, 업무용 이메일, 자기소개서 등 필요한 글의 초안을 입력해 보세요." />
                  <div className="pt-1"><div className="flex flex-wrap gap-2 items-center">
                      <button onClick={handleDraftButtonClick} disabled={draftingStage === 'fetchingOutline' || draftingStage === 'generatingBody'} className={draftButtonClassName}>
                        {getDraftButtonContent().icon}
                        <span>{getDraftButtonContent().text}</span>
                      </button>
                      <div className="h-5 w-px bg-gray-200"></div>
                      {["blogPost", "businessEmail", "opinionColumn", "socialMediaPost"].map((id) => {
                          const type = ["블로그","이메일","칼럼","SNS"][["blogPost", "businessEmail", "opinionColumn", "socialMediaPost"].indexOf(id)];
                          return (<button key={id} onClick={() => setActiveWritingType(id)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeWritingType === id ? "bg-black text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>{type}</button>)
                      })}
                  </div></div>
                </div>

                <div className="border border-gray-200 rounded-lg">
                    <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="w-full flex justify-between items-center p-4 hover:bg-gray-50 transition-colors">
                      <Label className="font-semibold text-base">글쓰기 설정</Label>
                      {isSettingsOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                    {isSettingsOpen && (
                      <div className="p-4 pt-2 space-y-5 bg-white border-t border-gray-200">
                        <ModernSlider label="전문성" value={expertiseLevel} onValueChange={setExpertiseLevel} labels={sliderLabels.expertise} />
                        <ModernSlider label="글 길이" value={textLength} onValueChange={setTextLength} labels={sliderLabels.length} />
                        <ModernSlider label="톤 앤 매너" value={textTone} onValueChange={setTextTone} labels={sliderLabels.tone} />
                      </div>
                    )}
                </div>

                {!isSubmitted ? (
                  <Button className="w-full h-12 text-base font-semibold bg-black hover:bg-gray-800 text-white transition-all relative overflow-hidden" size="lg" onClick={handleRewriteButtonClick} disabled={!inputText || draftingStage !== 'idle'}>
                    <Sparkles className="w-5 h-5 mr-2" />AI로 글 다듬기
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Button className="w-full h-12 text-base font-semibold bg-black hover:bg-gray-800 text-white transition-all relative overflow-hidden" onClick={handleRewriteButtonClick} disabled={isGenerating}>
                        <Sparkles className="w-5 h-5 mr-2" />{isGenerating ? "다시 생성 중..." : "글 다시 다듬기"}
                    </Button>
                    <Button variant="outline" className="w-full h-12 text-base" onClick={handleReset}>
                        <ArrowLeft className="w-5 h-5 mr-2" />새로 쓰기
                    </Button>
                  </div>
                )}
            </div>
        </div>
        
        {isSubmitted && (
          <div className="flex items-center justify-center bg-gray-100 transition-all p-6 md:p-12 animate-in fade-in-0 duration-500">
            <div className="w-full max-w-4xl space-y-6">
              <div className="flex items-center space-x-3"><div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center flex-shrink-0"><Sparkles className="w-5 h-5 text-white" /></div><h2 className="text-2xl font-bold">{isGenerating ? "AI가 글을 다듬고 있습니다..." : "AI가 다듬은 결과"}</h2></div>
              <div className="bg-white rounded-lg border border-gray-200 p-6 lg:p-8 shadow-sm min-h-[400px]">
                {isGenerating ? (
                  <div className="flex flex-col items-center justify-center h-full space-y-4 text-center"><TruckLoader /><p className="text-gray-500 font-medium mt-4">최고의 문장을 만들기 위해 분석하고 있어요.</p><p className="text-sm text-gray-400">잠시만 기다려 주세요.</p></div>
                ) : (
                  <div className="prose max-w-none prose-p:leading-relaxed prose-p:whitespace-pre-line text-lg text-gray-800">
                    <DynamicResultText text={displayedText} />
                  </div>
                )}
              </div>
              {!isGenerating && displayedText && !isTextAnimating && (
                <div className="flex items-center space-x-2 animate-in fade-in-0 duration-500">
                  <Button variant="outline" onClick={() => { /* copy logic */ }}><Copy className="w-4 h-4 mr-2" />복사하기</Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}