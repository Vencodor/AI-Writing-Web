"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import TruckLoader from "./components/loadingTruck.jsx"
import { PenTool, Sparkles, ArrowLeft, ChevronDown, ChevronUp, CheckCircle, Circle, Clock, Copy, AlertTriangle, FileText, Send } from "lucide-react"
import Cookies from 'js-cookie';

import "./components.css"

// --- 타입 정의 ---
interface ProcessStep {
  id: string
  title: string
  description: string
  status: "pending" | "processing" | "completed"
}
interface Source {
  title: string
  url: string
}
interface Tooltip {
  title: string
  tips: string[]
  type: string
}
interface RecentPost {
  id: string
  title: string
  originalText: string
  rewrittenText: string
  sources: Source[]
  createdAt: string
  type: string
  settings: {
    expertise: number[]
    length: number[]
    tone: number[]
  }
}

// --- 상수 정의 (백엔드 URL 수정) ---
const REWRITE_URL = "https://ai-writing-web.vercel.app/api/rewrite";
const DRAFT_OUTLINE_URL = "https://ai-writing-web.vercel.app/api/draft/outline";
const DRAFT_GENERATE_URL = "https://ai-writing-web.vercel.app/api/draft/generate";
const LOCAL_STORAGE_KEY = "ai_writer_recent_posts";

// --- 커스텀 훅: 로컬 스토리지 ---
const useLocalStorage = <T,>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] => {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.error(error);
    }
  };
  return [storedValue, setValue];
};

export default function Component() {
  // --- 상태 관리 ---

  // UI 상태
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isRecentPostsOpen, setIsRecentPostsOpen] = useState(false)
  const [showMoreTypes, setShowMoreTypes] = useState(false)
  const [showTooltip, setShowTooltip] = useState<Tooltip>()
  const [showUpdateLog, setShowUpdateLog] = useState(false)
  const [showExpandedTextbox, setShowExpandedTextbox] = useState(false)
  const [isUpdateLogClosing, setIsUpdateLogClosing] = useState(false)
  const [isExpandedTextboxClosing, setIsExpandedTextboxClosing] = useState(false)
  const [showCopyMessage, setShowCopyMessage] = useState(false)

  // 입력 및 설정 상태
  const [inputText, setInputText] = useState("")
  const [originalInputText, setOriginalInputText] = useState("")
  const [activeWritingType, setActiveWritingType] = useState("")
  const [expertiseLevel, setExpertiseLevel] = useState([1])
  const [textLength, setTextLength] = useState([1])
  const [textTone, setTextTone] = useState([1])
  const [isTextModified, setIsTextModified] = useState(false)

  // 생성 프로세스 상태
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedText, setGeneratedText] = useState("")
  const [displayedText, setDisplayedText] = useState("")
  const [sources, setSources] = useState<Source[]>([])
  const [processSteps, setProcessSteps] = useState<ProcessStep[]>([])
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [showProcessMap, setShowProcessMap] = useState(false)

  // 초안 작성 워크플로우 상태
  const [draftingStage, setDraftingStage] = useState<'idle' | 'fetchingOutline' | 'awaitingSubmit' | 'generatingBody'>('idle');
  const [draftOutline, setDraftOutline] = useState<any>(null);

  // 애니메이션 및 효과 상태
  const [placeholderText, setPlaceholderText] = useState("")
  const [isTyping, setIsTyping] = useState(true)
  const [isTextAnimating, setIsTextAnimating] = useState(false)
  const [isTextareaFocused, setIsTextareaFocused] = useState(false)
  const [mockFeedbacks, setMockFeedbacks] = useState<string[]>([])
  const [currentMockIndex, setCurrentMockIndex] = useState(0)
  const [showMockFeedback, setShowMockFeedback] = useState(false)

  const [recentPosts, setRecentPosts] = useLocalStorage<RecentPost[]>(LOCAL_STORAGE_KEY, [])
  const textRef = useRef<HTMLTextAreaElement>(null)

  // --- 더미 데이터 및 설정값 ---
  const TOOL_TIPS = {
    reset: { title: "", tips: [], type: "" },
    welcome: {
      title: "AI Writer 사용법",
      tips: ["글의 초안을 입력하고 글쓰기 유형을 선택하세요", "AI 초안 작성 기능으로 초안 단계에서 도움받을 수 있습니다", "전문성 수준, 글 길이, 톤을 조절하여 맞춤 설정이 가능합니다", "버튼을 클릭하여 도움말을 끌 수 있습니다"],
      type: ""
    },
    draft: {
      title: "AI 초안 사용법",
      tips: ["글의 주제와 목적을 텍스트박스에 입력한 후 AI 초안 작성 버튼을 누르면 AI가 출처에 기반한 초안을 작성합니다"],
      type: ""
    },
  }
  const updateLogs = [
    { version: "v2.0.0", date: "2025.07.08", title: "초안 생성기능 추가 & 피드백 개선", changes: ["'AI 초안 생성' 버튼추가", "내부 프로세스 개선"], devNote: "가장 유의미한 업데이트이므로 2.0.0 버전으로 업그레이드 되었습니다"},
    { version: "v1.0.7", date: "2025.07.08", title: "AI 피드백 및 UI 대폭 개선", changes: ["피드백 처리절차 수정", "로딩바 추가"], devNote: "글쓰기 피드백 기능을 강화하였습니다"},
    { version: "v1.0.6", date: "2025.07.08", title: "AI 추천 기능 및 UI 개선", changes: ["AI 추천 글쓰기 유형 버튼 추가", "텍스트 입력 시 자동 확장 기능 개선", "더보기 버튼 호버 패널 안정성 향상", "모바일 반응형 디자인 최적화"], devNote: "더욱 직관적인 인터페이스와 새로운 기능을 준비중입니다."},
    { version: "v1.0.5", date: "2025.07.07", title: "성능 최적화 및 버그 수정", changes: ["AI 응답 속도 향상", "피드백 처리절차 개선", "기타 버그 수정 및 UI 개선"], devNote: "더 빠르고 안정적인 서비스를 위해 백엔드 최적화를 진행했습니다."},
    { version: "v1.0.0", date: "2025.07.06", title: "서비스 오픈 - AI 글쓰기 도우미", changes: ["Gemini Pro 기반 AI 엔진 적용", "실시간 글 생성 프로세스 시각화", "출처 자동 인용 기능 추가", "글쓰기 유형별 맞춤 설정 강화"], devNote: "AI 도우미로 정교한 글쓰기를 지원합니다"},
  ]
  const writingTypes = [
    { id: "blogPost", label: "블로그", expertise: [2], length: [2], tone: [1] },
    { id: "socialMediaPost", label: "SNS 게시물", expertise: [1], length: [0], tone: [0] },
    { id: "productReview", label: "상품 리뷰", expertise: [2], length: [2], tone: [1] },
    { id: "opinionColumn", label: "칼럼", expertise: [3], length: [3], tone: [3] },
    { id: "businessEmail", label: "이메일", expertise: [2], length: [1], tone: [3] },
    { id: "formalReport", label: "보고서", expertise: [3], length: [3], tone: [4] },
    { id: "marketingCopy", label: "광고 문구", expertise: [2], length: [0], tone: [1] },
    { id: "presentationScript", label: "발표 대본", expertise: [2], length: [2], tone: [2] },
    { id: "academicPaper", label: "논문", expertise: [4], length: [4], tone: [4] },
    { id: "bookReport", label: "독후감", expertise: [2], length: [2], tone: [2] },
    { id: "howToGuide", label: "가이드", expertise: [2], length: [3], tone: [2] },
    { id: "dailyStory", label: "일상 글", expertise: [1], length: [1], tone: [0] },
    { id: "coverLetter", label: "자기소개서", expertise: [2], length: [2], tone: [3] },
    { id: "creativeStory", label: "창작 글", expertise: [2], length: [3], tone: [1] },
    { id: "letter", label: "편지", expertise: [1], length: [1], tone: [1] },
    { id: "faq", label: "FAQ", expertise: [2], length: [2], tone: [2] },
  ];
  const exampleText = `AI 글쓰기 도우미를 활용하는 방법은 다양합니다. 블로그 포스팅, 업무용 이메일, 자기소개서 등 필요한 글의 초안을 여기에 입력하고 원하는 글쓰기 유형을 선택해 보세요.`
  const createInitialSteps = (): ProcessStep[] => [
    { id: "analyze", title: "종합적 요구사항 분석", description: "주제, 목적, 요구사항을 파악하고 있습니다", status: "pending" },
    { id: "feedback", title: "글 피드백", description: "다양한 기준에 맞추어 글을 점검하고 있습니다", status: "pending" },
    { id: "rewrite", title: "글 피드백", description: "모든 요청을 반영중입니다", status: "pending" },
  ]
  
  // --- useEffect 훅 ---
  useEffect(() => {
    let clientId = Cookies.get('clientId');
    if (!clientId) {
      clientId = crypto.randomUUID();
      Cookies.set('clientId', clientId, { path: '/', sameSite: 'lax', expires: 365 });
    }
  }, []);

  useEffect(() => {
    if (isSubmitted || inputText) return;
    let currentIndex = 0;
    const typeText = () => {
      if (currentIndex < exampleText.length) {
        setPlaceholderText(exampleText.slice(0, currentIndex + 1));
        currentIndex++;
        setTimeout(typeText, 30);
      } else {
        setIsTyping(false);
      }
    };
    if (!isTyping) return;
    typeText();
  }, [isSubmitted, inputText, isTyping, exampleText]);

  useEffect(() => {
    if (generatedText && !isGenerating) {
      setIsTextAnimating(true);
      setDisplayedText("");
      let currentIndex = 0;
      const animateText = () => {
        if (currentIndex < generatedText.length) {
          const nextIndex = Math.min(currentIndex + 5, generatedText.length);
          setDisplayedText(generatedText.slice(0, nextIndex));
          currentIndex = nextIndex;
          requestAnimationFrame(animateText);
        } else {
          setDisplayedText(generatedText);
          setIsTextAnimating(false);
        }
      };
      const animationFrameId = requestAnimationFrame(animateText);
      return () => cancelAnimationFrame(animationFrameId);
    }
  }, [generatedText, isGenerating]);

  useEffect(() => {
    if (showTooltip?.type === "error") {
      const timer = setTimeout(() => {
        setTooltip(TOOL_TIPS.reset)
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showTooltip]);

  useEffect(() => {
    if (showMockFeedback && mockFeedbacks.length > 1) {
      const interval = setInterval(() => {
        setCurrentMockIndex((prevIndex) => (prevIndex + 1) % mockFeedbacks.length);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [showMockFeedback, mockFeedbacks.length]);

  // --- 헬퍼 함수 ---
  const formatOutlineForDisplay = (outlineData: any): string => {
    if (!outlineData || !outlineData.title || !outlineData.outline) {
      return "개요 생성에 실패했습니다. 내용을 지우고 다시 시도해주세요.";
    }
    let formattedText = `# ${outlineData.title}\n\n`;
    formattedText += "## 개요\n";
    outlineData.outline.forEach((item: any, index: number) => {
      formattedText += `${index + 1}. ${item.title}\n`;
      formattedText += `   - ${item.description}\n\n`;
    });
    formattedText += "------------------------------------\n";
    formattedText += "위 개요를 바탕으로 글을 생성합니다. 내용을 자유롭게 수정하거나, 바로 '개요 제출' 버튼을 눌러주세요.";
    return formattedText;
  };

  // --- 핵심 로직 함수 ---

  const saveResultToLocalStorage = (original: string, rewritten: string, currentSources: Source[]) => {
    const typeLabel = writingTypes.find(t => t.id === activeWritingType)?.label || "일반 글";
    const title = (rewritten || original).split('\n')[0].slice(0, 30) || "제목 없음";
    
    const newPost: RecentPost = {
      id: new Date().toISOString(),
      title,
      originalText: original,
      rewrittenText: rewritten,
      sources: currentSources,
      createdAt: new Date().toISOString(),
      type: typeLabel,
      settings: { expertise: expertiseLevel, length: textLength, tone: textTone },
    };
    setRecentPosts(prevPosts => [newPost, ...prevPosts].slice(0, 10));
  };
  
  const updateProcessStep = (stepIndex: number) => {
    setCurrentStepIndex(stepIndex)
    setProcessSteps((prevSteps) =>
      prevSteps.map((step, index) => {
        if (index < stepIndex) return { ...step, status: "completed" as const }
        if (index === stepIndex) return { ...step, status: "processing" as const }
        return { ...step, status: "pending" as const }
      }),
    )
  }

  const startProcessing = async () => {
    const initialSteps = createInitialSteps()
    setProcessSteps(initialSteps)
    setCurrentStepIndex(0)
    setShowProcessMap(true)
    setIsGenerating(true)
    setOriginalInputText(inputText)
    setGeneratedText(""); 
    setSources([]); 
    setMockFeedbacks([])
    setCurrentMockIndex(0)
    setShowMockFeedback(false)
    updateProcessStep(0)
    let finalGeneratedText = "";

    try {
      const clientId = Cookies.get('clientId');
      const response = await fetch(REWRITE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputText, expertiseLevel, textLength, textTone, clientId }),
      });

      if (!response.ok || !response.body) throw new Error(`API 요청 실패: ${response.statusText}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n\n").filter((line) => line.trim() !== "");
        
        for (const line of lines) {
          if (line.startsWith("data:")) {
            const jsonString = line.replace("data: ", "");
            const data = JSON.parse(jsonString);

            if (data.text) { finalGeneratedText = data.text; setGeneratedText(data.text); }
            if (data.process) { updateProcessStep(Number(data.process)); }
            if (data.diagnostics) {
              const diagnostics = data.diagnostics.map((dia: any) => `${dia.original_text_segment} / ${dia.issue_type}`);
              setMockFeedbacks(prev => [...prev, ...diagnostics]);
              setShowMockFeedback(true);
            }
          }
        }
      }
      saveResultToLocalStorage(inputText, finalGeneratedText, sources);

    } catch (error) {
      console.error("Error fetching AI stream:", error);
      setTooltip({ title: "오류 발생", tips: ["글 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."], type: "error" });
      handleReset();
    } finally {
      setShowProcessMap(false);
      setIsGenerating(false);
    }
  };

  const handleFetchOutline = async () => {
    setDraftingStage('fetchingOutline');
    setInputText("AI가 글의 구조를 설계하고 있습니다. 잠시만 기다려주세요...");

    try {
      const clientId = Cookies.get('clientId');
      const response = await fetch(DRAFT_OUTLINE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputText, activeWritingType, clientId }),
      });

      if (!response.ok) throw new Error(`개요 생성 API 요청 실패: ${response.statusText}`);

      const outlineData = await response.json();
      setDraftOutline(outlineData);
      setInputText(formatOutlineForDisplay(outlineData));
      setDraftingStage('awaitingSubmit');

    } catch (error) {
      console.error("Error fetching outline:", error);
      setTooltip({ title: "오류 발생", tips: ["개요 생성 중 오류가 발생했습니다."], type: "error" });
      setInputText(originalInputText);
      setDraftingStage('idle');
    }
  };

  const handleGenerateBody = async () => {
    setDraftingStage('generatingBody');
    const finalizedOutline = draftOutline;
    
    try {
      const clientId = Cookies.get('clientId');
      const response = await fetch(DRAFT_GENERATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalizedOutline, clientId, expertiseLevel, textLength, textTone }),
      });

      if (!response.ok || !response.body) throw new Error(`본문 생성 API 요청 실패: ${response.statusText}`);
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let firstChunk = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n\n").filter((line) => line.trim() !== "");
        
        for (const line of lines) {
          if (line.startsWith("data:")) {
            const jsonString = line.replace("data: ", "");
            try {
              const data = JSON.parse(jsonString);
              if (data.text) {
                if (firstChunk) {
                  setInputText(data.text);
                  firstChunk = false;
                } else {
                  setInputText((prev) => prev + data.text);
                }
              }
              if (data.event === 'done') return;
            } catch (e) {
                console.warn("Could not parse SSE JSON chunk:", jsonString);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error generating body:", error);
      setTooltip({ title: "오류 발생", tips: ["본문 생성 중 오류가 발생했습니다."], type: "error" });
    } finally {
      setDraftingStage('idle');
      setDraftOutline(null);
    }
  };

  // --- 이벤트 핸들러 ---
  const handleSubmit = () => {
    if (isGenerating) return;
    if (inputText.length < 50) {
      setTooltip({ title: "초안 길이 부족", tips: ["초안의 길이는 최소 50자가 넘어야 합니다."], type: "error" });
      return;
    }
    setIsSettingsOpen(false); setIsSubmitted(true); setIsTextAnimating(false);
    setIsRecentPostsOpen(false); setDisplayedText(""); setGeneratedText("");
    setTooltip(TOOL_TIPS.reset);
    startProcessing();
  };

  const handleDraftTextClick = () => {
    if (draftingStage === 'idle') {
      if (inputText.length < 10) {
        setTooltip({ title: "주제 입력 필요", tips: ["초안을 생성하려면 주제, 목적 등을 포함해 최소 10자가 넘어야 합니다"], type: "error"});
        return;
      }
      if (!activeWritingType) {
        setTooltip({ title: "태그 설정 필요", tips: ["어떤 글의 유형을 작성할 지 선택해주세요"], type: "error" });
        return;
      }
      setTooltip(TOOL_TIPS.reset);
      setOriginalInputText(inputText);
      handleFetchOutline();
    } else if (draftingStage === 'awaitingSubmit') {
      handleGenerateBody();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setInputText(newValue);
    if (isSubmitted) setIsTextModified(newValue !== originalInputText);
    if (textRef.current) {
      textRef.current.style.height = `auto`;
      textRef.current.style.height = `${textRef.current.scrollHeight}px`;
    }
  };

  const handleReset = useCallback(() => {
    setIsSubmitted(false); setIsGenerating(false); setOriginalInputText(""); setGeneratedText("");
    setDisplayedText(""); setIsTextAnimating(false); setShowProcessMap(false); setProcessSteps([]);
    setCurrentStepIndex(0); setIsTextareaFocused(false); setIsTextModified(false);
    setIsRecentPostsOpen(false); setSources([]);
    setDraftingStage('idle'); setDraftOutline(null);
  }, []);

  const handleCopy = async () => {
    try {
      const originalGeneratedText = generatedText.replace(/\[\d+\]/g, "");
      await navigator.clipboard.writeText(originalGeneratedText);
      setShowCopyMessage(true);
      setTimeout(() => setShowCopyMessage(false), 3000);
    } catch (error) {
      console.error("복사 실패:", error);
      const textArea = document.createElement("textarea");
      textArea.value = generatedText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setShowCopyMessage(true);
      setTimeout(() => setShowCopyMessage(false), 3000);
    }
  }

  const handlePostClick = (post: RecentPost) => {
    setInputText(post.originalText); setOriginalInputText(post.originalText);
    setGeneratedText(post.rewrittenText); setDisplayedText(post.rewrittenText);
    setSources(post.sources || []); setExpertiseLevel(post.settings.expertise);
    setTextLength(post.settings.length); setTextTone(post.settings.tone);
    
    const matchedType = writingTypes.find(t => t.label === post.type);
    if (matchedType) setActiveWritingType(matchedType.id); else setActiveWritingType("");
    
    setIsSubmitted(true); setIsRecentPostsOpen(false); setIsTextModified(false);
  };

  const toggleSettings = () => setIsSettingsOpen(!isSettingsOpen);
  
  const handleWritingTypeClick = (type: { id: string; label: string; expertise: number[]; length: number[]; tone: number[] }) => {
    if (activeWritingType === type.id) {
      setActiveWritingType(""); setIsSettingsOpen(false);
      setExpertiseLevel([1]); setTextLength([1]); setTextTone([1]);
    } else {
      setActiveWritingType(type.id); setExpertiseLevel(type.expertise);
      setTextLength(type.length); setTextTone(type.tone); setIsSettingsOpen(true);
    }
  }

  const setTooltip = (target: Tooltip) => {
    if (showTooltip?.type == "error" && target.title.length >= 1) return;
    setShowTooltip(target.title.length <= 1 ? undefined : target);
  }

  const handleCloseUpdateLog = () => {
    setIsUpdateLogClosing(true);
    setTimeout(() => { setShowUpdateLog(false); setIsUpdateLogClosing(false); }, 200);
  }

  const handleCloseExpandedTextbox = () => {
    setIsExpandedTextboxClosing(true);
    setTimeout(() => { setShowExpandedTextbox(false); setIsExpandedTextboxClosing(false); }, 200);
  }

  // --- 렌더링 함수 ---
  const renderTextWithSources = (text: string) => { /* ... (기존 코드와 동일) ... */ };
  const getStepIcon = (step: ProcessStep) => { /* ... (기존 코드와 동일) ... */ };

  const getDraftButtonContent = () => {
    switch (draftingStage) {
      case 'fetchingOutline':
        return {
          icon: <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>,
          text: "개요 생성중.."
        };
      case 'awaitingSubmit':
        return { icon: <Send className="w-3 h-3 text-white" />, text: "개요 제출" };
      case 'generatingBody':
        return {
          icon: <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>,
          text: "본문 작성중.."
        };
      case 'idle':
      default:
        return { icon: <FileText className="w-3 h-3 text-purple-500" />, text: "AI 초안 작성" };
    }
  };
  const draftButtonContent = getDraftButtonContent();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className={`min-h-screen transition-all duration-300 ease-in-out ${isSubmitted ? "md:grid md:grid-cols-[320px_1fr] flex flex-col" : "grid grid-cols-1"}`}>
        {isRecentPostsOpen && (
          <>
            <div className={`fixed top-0 left-0 w-full md:w-[280px] h-full bg-white border-r flex flex-col z-50 shadow-lg animate-in slide-in-from-left-full fade-in-0 duration-300 ease-in-out`}>
              <div className="border-b border-border flex-shrink-0 px-4 py-2.5"></div>
              <div className="flex-1 overflow-hidden">
                <div className="px-4 pt-4 h-full flex flex-col">
                  <h4 className="font-semibold text-sm mb-3 text-gray-900 flex-shrink-0 px-2">최근 글 목록</h4>
                  <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar">
                    {recentPosts.length > 0 ? (
                      recentPosts.map((post) => (
                        <div key={post.id} onClick={() => handlePostClick(post)} className="p-2.5 mx-1 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 cursor-pointer transition-all duration-200 ease-in-out group">
                          <div className="flex items-start justify-between mb-1.5"><h5 className="font-medium text-sm text-gray-900 group-hover:text-gray-700 line-clamp-1 pr-2">{post.title}</h5><span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full flex-shrink-0">{post.type}</span></div>
                          <p className="text-xs text-gray-500 line-clamp-2 mb-1.5">{post.originalText}</p>
                          <p className="text-xs text-gray-400">{new Date(post.createdAt).toLocaleDateString("ko-KR")}</p>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-10 px-4"><p className="text-sm text-gray-500">아직 작성한 글이 없습니다.</p><p className="text-xs text-gray-400 mt-2">AI로 글을 다듬으면 여기에 저장됩니다.</p></div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="fixed inset-0 bg-black/20 z-40 animate-in fade-in-0 duration-300" onClick={() => setIsRecentPostsOpen(false)} />
          </>
        )}
        
        <div className={`flex flex-col transition-all duration-300 ease-in-out overflow-hidden ${isSubmitted ? "p-3 md:p-4 lg:p-6 md:border-r border-border" : "p-4 md:p-8 justify-center items-center"}`}>
          <div className={`flex flex-col w-full transition-all duration-300 ease-in-out ${isSubmitted ? "space-y-4 lg:space-y-5 max-w-full lg:max-w-sm" : "space-y-4 lg:space-y-6 max-w-full lg:max-w-xl"}`}>
            <div className={`flex flex-col space-y-2 transition-all duration-300 ease-in-out ${isSubmitted ? "opacity-85" : "opacity-100"}`}>
              <div className="flex items-center space-x-2">
                <a href="/" className="flex items-center justify-center w-8 md:w-10 h-8 md:h-10 bg-primary rounded-lg cursor-pointer"><PenTool className="w-4 md:w-5 h-4 md:h-5 text-primary-foreground" /></a>
                <div>
                  <h1 className={`font-bold transition-all duration-300 ease-in-out ${isSubmitted ? "text-lg md:text-xl" : "text-xl md:text-2xl"}`}>AI Writer</h1>
                  <div className="flex items-center space-x-2"><p className="text-xs md:text-sm text-muted-foreground">AI 글쓰기 도우미</p>
                    {!isSubmitted && (<button onClick={() => setShowUpdateLog(true)} className="flex items-center space-x-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors duration-200 group"><span className="text-xs text-gray-600 font-medium">{updateLogs[0].version}</span><span className="text-xs text-gray-500">새로운 기능</span><ChevronDown className="w-3 h-3 text-gray-400 group-hover:text-gray-600 transition-colors" /></button>)}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content" className={`font-medium transition-all duration-300 ease-in-out ${isSubmitted ? "text-sm" : "text-base"}`}>{draftingStage === 'awaitingSubmit' ? '개요를 확인 및 수정하세요' : '글 주제를 입력하세요'}</Label>
              <div className="relative">
                <Textarea id="content" value={inputText} onChange={handleInputChange} onFocus={() => { setIsTextareaFocused(true); setTooltip(TOOL_TIPS.reset); }} onBlur={() => setIsTextareaFocused(false)} ref={textRef} placeholder={isSubmitted ? "여기에 글의 주제나 내용을 입력해주세요." : placeholderText} disabled={draftingStage === 'fetchingOutline' || draftingStage === 'generatingBody'} className={`resize-none transition-all duration-300 ease-in-out p-3 md:p-4 focus:ring-0 focus:ring-offset-0 focus:border-border font-light border-slate-300 focus:outline-none text-sm md:text-base border ${isSubmitted ? "min-h-[120px] md:min-h-[140px]" : isTextareaFocused || inputText ? "md:min-h-[200px] w-full transform" : "min-h-[120px] w-full transform scale-100"} ${inputText.length > 100 ? "min-h-[250px] md:min-h-[300px]" : ""} ${inputText.length > 300 ? "min-h-[350px] md:min-h-[400px]" : ""} ${inputText.length > 500 ? "min-h-[450px] md:min-h-[500px]" : ""}`} />
                <button onClick={() => setShowExpandedTextbox(true)} className="absolute bottom-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 transition-colors duration-200" title="크게보기"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg></button>
              </div>
              <div className={`pt-1 transition-all duration-300 ease-in-out ${isSubmitted ? "opacity-80" : "opacity-100"}`}>
                <div className="flex flex-wrap gap-2 justify-start items-center relative">
                  <button onClick={handleDraftTextClick} onMouseEnter={() => {if(showTooltip?.type !== "error") setTooltip(TOOL_TIPS.draft)}} onMouseLeave={() => {if(showTooltip?.type !== "error") setTooltip(TOOL_TIPS.reset)}} disabled={draftingStage === 'fetchingOutline' || draftingStage === 'generatingBody'} className={`px-3 py-1.5 rounded-full text-sm md:text-xs font-medium transition-all duration-300 ease-in-out min-h-[30px] md:min-h-auto relative animate-in fade-in-0 overflow-hidden flex items-center space-x-2 ${(draftingStage === 'fetchingOutline' || draftingStage === 'generatingBody') ? "bg-gray-300 text-gray-500 cursor-not-allowed" : draftingStage === 'awaitingSubmit' ? "bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300"}`}>
                    {draftButtonContent.icon}
                    <span className="relative z-10">{draftButtonContent.text}</span>
                  </button>
                  <div className="h-4 w-px bg-gray-200"></div>
                  {activeWritingType.length > 0 && (() => { const type = writingTypes.find((t) => t.id === activeWritingType); return type ? (<button key={type.id} onClick={() => handleWritingTypeClick(type)} className={`px-3 py-1.5 rounded-full text-sm md:text-xs font-medium transition-all duration-200 ease-in-out min-h-[30px] md:min-h-auto bg-primary text-primary-foreground shadow-md`}>{type.label}</button>) : null })()}
                  {writingTypes.slice(1, 4).map((type) => (<button key={type.id} onClick={() => handleWritingTypeClick(type)} className={`px-3 py-1.5 rounded-full text-sm md:text-xs font-medium transition-all duration-200 ease-in-out min-h-[30px] md:min-h-auto ${activeWritingType === type.id ? "bg-primary text-primary-foreground shadow-md" : "bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300"}`}>{type.label}</button>))}
                  <div className="relative"><button className="px-3 py-1.5 rounded-full text-sm md:text-xs font-medium transition-all duration-200 ease-in-out min-h-[30px] md:min-h-auto bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300" onClick={() => setShowMoreTypes(!showMoreTypes)}>더보기</button>
                    {showMoreTypes && (<div className="absolute animate-in fade-in-0 top-full left-0 mt-2 opacity-100 transition-opacity duration-200 ease-in-out z-10" onMouseLeave={() => setShowMoreTypes(false)}><div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[200px]"><div className="flex flex-wrap gap-2">{writingTypes.slice(4).map((type) => (<button key={type.id} onClick={() => handleWritingTypeClick(type)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ease-in-out ${activeWritingType === type.id ? "bg-primary text-primary-foreground shadow-md" : "bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300"}`}>{type.label}</button>))}</div><div className="absolute bottom-full left-4 transform translate-y-1"><div className="w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-white"></div></div></div></div>)}
                  </div>
                </div>
              </div>
            </div>
            
            <div className={`transition-all duration-300 ease-in-out ${isSubmitted ? "opacity-80" : "opacity-100"}`}>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button onClick={toggleSettings} className={`w-full flex justify-between p-4 hover:bg-gray-100 transition-colors duration-200 ease-in-out text-black bg-transparent items-center ${isSubmitted ? "p-3" : "p-4"}`}>
                  <Label className={`font-medium transition-all duration-300 ease-in-out ${isSubmitted ? "text-sm" : "text-base"}`}>글쓰기 설정</Label>
                  {isSettingsOpen ? (<ChevronUp className={`transition-all duration-300 ease-in-out ${isSubmitted ? "w-4 h-4" : "w-5 h-5"}`} />) : (<ChevronDown className={`transition-all duration-300 ease-in-out ${isSubmitted ? "w-4 h-4" : "w-5 h-5"}`} />)}
                </button>
                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isSettingsOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}>
                  <div className={`p-4 space-y-6 bg-white ${isSubmitted ? "p-3 space-y-4" : "p-4 space-y-6"}`}>
                    <div className="space-y-3"><Label className={`font-medium transition-all duration-300 ease-in-out ${isSubmitted ? "text-sm" : "text-base"}`}>글 전문성 수준</Label><Slider value={expertiseLevel} onValueChange={setExpertiseLevel} max={4} step={1} defaultValue={[2]} className="w-full" /><div className={`flex justify-between text-muted-foreground transition-all duration-300 ease-in-out ${isSubmitted ? "text-xs" : "text-sm"}`}><span>일반적</span><span>보통</span><span>전문적</span></div></div>
                    <div className="space-y-3"><Label className={`font-medium transition-all duration-300 ease-in-out ${isSubmitted ? "text-sm" : "text-base"}`}>글 길이</Label><Slider value={textLength} onValueChange={setTextLength} max={4} step={1} className="w-full" defaultValue={[2]} /><div className={`flex justify-between text-muted-foreground transition-all duration-300 ease-in-out ${isSubmitted ? "text-xs" : "text-sm"}`}><span>짧게</span><span>보통</span><span>길게</span></div></div>
                    <div className="space-y-3"><Label className={`font-medium transition-all duration-300 ease-in-out ${isSubmitted ? "text-sm" : "text-base"}`}>톤 앤 매너</Label><Slider value={textTone} onValueChange={setTextTone} max={4} step={1} defaultValue={[2]} className="w-full" /><div className={`flex justify-between text-muted-foreground transition-all duration-300 ease-in-out ${isSubmitted ? "text-xs" : "text-sm"}`}><span>친근한</span><span>중립적</span><span>공식적</span></div></div>
                  </div>
                </div>
              </div>
            </div>

            {!isSubmitted ? (
              <Button className="w-full h-12 md:h-12 text-base transition-all duration-300 ease-in-out" size="lg" onClick={handleSubmit} disabled={!inputText || draftingStage !== 'idle'}>
                <Sparkles className="w-5 h-5 md:w-4 md:h-4 mr-2" />AI로 글 다듬기
              </Button>
            ) : (
              <div className="space-y-3 md:space-y-2">
                <Button className={`w-full h-12 md:h-10 text-base md:text-sm transition-all duration-300 ease-in-out ${!isGenerating && isTextModified ? "animate-in fade-in-0 slide-in-from-top-2" : ""}`} onClick={handleSubmit} disabled={isGenerating || !inputText}>
                  <Sparkles className="w-5 h-5 md:w-4 md:h-4 mr-2" />{isGenerating ? "생성 중.." : isTextModified ? "글 피드백" : "글 재생성"}
                </Button>
                <Button variant="outline" className="w-full h-12 md:h-10 text-base md:text-sm transition-all duration-300 ease-in-out bg-transparent" onClick={handleReset}>
                  <ArrowLeft className="w-5 h-5 md:w-4 md:h-4 mr-2" />다시 편집
                </Button>
              </div>
            )}
          </div>
        </div>

        {isSubmitted && (
          <div className="items-start justify-center bg-muted/20 transition-all ease-in-out p-3 md:p-4 lg:p-12 animate-in fade-in-0 duration-500 min-h-screen md:min-h-0 md:items-center lg:px-12">
            <div className="w-full max-w-full lg:max-w-4xl space-y-3 md:space-y-4 lg:space-y-6">
              <div className="flex items-center space-x-2 md:space-x-3 mb-4 md:mb-8"><div className="w-6 md:w-8 h-6 md:h-8 bg-primary rounded-full flex items-center justify-center"><Sparkles className="w-3 md:w-4 h-3 md:h-4 text-primary-foreground" /></div><h2 className="text-lg md:text-2xl font-bold">{showProcessMap ? "AI가 글을 작성하고 있습니다" : "AI가 다듬은 결과"}</h2></div>
              <div className="bg-white rounded-lg border p-4 lg:p-8 shadow-sm">
                {showProcessMap ? (
                  <div className="py-8"><div className="max-w-md mx-auto space-y-6"><div className="flex justify-center items-center"><TruckLoader /></div><div className="text-center min-h-[80px] flex flex-col justify-center"><h3 className="font-medium text-gray-800 mb-2">{processSteps[currentStepIndex]?.title}</h3>{(showMockFeedback && mockFeedbacks.length > 1) ? (<div className="relative overflow-hidden h-12 flex items-center justify-center"><div key={currentMockIndex} className="absolute animate-in slide-in-from-bottom-4 fade-in-0 duration-500"><p className="text-sm text-gray-600 leading-relaxed px-4">{mockFeedbacks[currentMockIndex]}</p></div></div>) : (<p className="text-sm text-gray-600">{processSteps[currentStepIndex]?.description}</p>)}<p className="text-xs text-gray-400 mt-2">{currentStepIndex + 1} / {processSteps.length}</p></div></div></div>
                ) : (
                  <div className="prose max-w-none prose-p:leading-relaxed prose-p:whitespace-pre-line text-gray-800">{displayedText}</div>
                )}
              </div>
              {!isGenerating && displayedText && !isTextAnimating && !showProcessMap && (
                <div className="space-y-4 animate-in fade-in-0 duration-500">
                  {sources.length > 0 && (<div className="space-y-2"><h3 className="text-sm font-medium text-gray-700">참고 출처</h3><div className="flex flex-wrap gap-2">{sources.map((source, index) => (<button key={index} onClick={() => window.open(source.url, "_blank")} className="inline-flex items-center px-2.5 py-1 bg-white border border-gray-200 rounded-full text-xs text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors duration-200 ease-in-out shadow-sm" title={source.title}>{source.title.slice(0, 4)}</button>))}</div></div>)}
                  <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4 transition-all duration-300 ease-in-out opacity-100 translate-y-0"><Button variant="outline" onClick={handleCopy} className="flex items-center space-x-2 bg-transparent"><Copy className="w-4 h-4" /><span>복사하기</span></Button></div>
                </div>
              )}
              {showCopyMessage && (<div className="fixed top-6 right-6 z-50 animate-in fade-in-0 slide-in-from-top-2 duration-300 ease-in-out"><div className="bg-black text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2"><CheckCircle className="w-4 h-4" /><span className="text-sm font-medium">복사되었습니다</span></div></div>)}
            </div>
          </div>
        )}

        {!isSubmitted && (
          <div className="fixed bottom-4 md:bottom-6 left-4 md:left-6 z-50"><button onClick={() => setIsRecentPostsOpen(!isRecentPostsOpen)} className="w-12 md:w-10 h-12 md:h-10 text-gray-500 hover:text-gray-700 active:text-gray-800 transition-all duration-200 ease-in-out flex items-center justify-center hover:scale-105 active:scale-95 bg-white md:bg-transparent rounded-full md:rounded-none shadow-lg md:shadow-none" title="최근 글 목록"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></button></div>
        )}

        <div className="fixed bottom-4 md:bottom-6 right-4 md:right-6 z-50">
          <div className="relative">
            <button onMouseEnter={() => {if(!showTooltip || showTooltip.type.length === 0) setTooltip(TOOL_TIPS.welcome)}} onMouseLeave={() => {if(showTooltip?.type.length === 0) setTooltip(TOOL_TIPS.reset)}} onClick={() => {if (showTooltip?.type === "error") setTooltip(TOOL_TIPS.reset)}} className={`w-12 md:w-10 h-12 md:h-10 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out flex items-center justify-center hover:scale-105 active:scale-95 text-base md:text-sm ${showTooltip?.type === "error" ? "bg-red-500 text-white" : "bg-primary text-primary-foreground"}`}>
              {showTooltip?.type === "error" ? (<AlertTriangle className="w-5 h-5"/>) : ("?")}
            </button>
            {showTooltip && (<div>
              {showTooltip.type.length === 0 && (<div className="absolute bottom-full right-0 mb-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-in-out"><div className="space-y-3"><h3 className={`font-semibold text-sm text-gray-900}`}>{showTooltip.title}</h3>{showTooltip.tips.map((msg, idx) => (<div key={idx} className="space-y-2 text-xs text-gray-600"><div className="flex items-start space-x-2"><span className="w-1 h-1.5 bg-primary rounded-full mt-1.5 flex-shrink-0"></span><span>{msg}</span></div></div>))}</div><div className="absolute bottom-0 right-4 transform translate-y-full"><div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-white"></div></div></div>)}
              {showTooltip.type === "error" && (<div className="absolute bottom-full right-0 mb-2 w-80 bg-red-50 border border-red-200 rounded-lg shadow-lg p-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-in-out"><div className="space-y-2"><h3 className="font-semibold text-sm text-red-900">{showTooltip.title}</h3>{showTooltip.tips.map((msg, idx) => (<p key={idx} className="text-xs text-red-700"><span>{msg}</span></p>))}</div><div className="absolute bottom-0 right-4 transform translate-y-full"><div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-red-200"></div></div></div>)}
            </div>)}
          </div>
        </div>

        {showUpdateLog && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><div className={`bg-white rounded-lg shadow-xl max-w-xl w-full overflow-hidden ${isUpdateLogClosing ? "animate-out fade-out-0 zoom-out-95 duration-300 ease-in-out" : "animate-in fade-in-0 zoom-in-95 duration-200 ease-in-out"}`}><div className="flex overflow-hidden items-center justify-between p-6 border-b border-gray-200"><div><h2 className="text-xl font-bold text-gray-900">업데이트 로그</h2><p className="text-sm text-gray-500 mt-1">AI Writer의 최신 업데이트 내역을 확인하세요</p></div><button onClick={handleCloseUpdateLog} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"><svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div><div className="max-h-[calc(80vh-120px)] p-6 overflow-y-auto"><div className="space-y-6">{updateLogs.map((log, index) => (<div key={log.version} className="relative">{index !== updateLogs.length - 1 && (<div className="absolute left-4 top-12 w-0.5 h-full bg-gray-200"></div>)}<div className="flex space-x-4"><div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center"><span className="text-xs font-bold text-white">{log.version.replace("v", "").split(".")[0]}</span></div><div className="flex-1 min-w-0"><div className="flex items-center space-x-2 mb-2"><h3 className="font-semibold text-gray-900">{log.version}</h3><span className="text-sm text-gray-500">{log.date}</span></div><h4 className="font-medium text-gray-800 mb-3">{log.title}</h4><ul className="space-y-1 mb-4">{log.changes.map((change, changeIndex) => (<li key={changeIndex} className="flex items-start space-x-2 text-sm text-gray-600"><span className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 flex-shrink-0"></span><span>{change}</span></li>))}</ul><div className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded-r"><p className="text-sm text-blue-800"><span className="font-medium">Comment:</span> {log.devNote}</p></div></div></div></div>))}</div></div></div></div>)}
        {showExpandedTextbox && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className={`bg-white rounded-lg shadow-xl w-full max-w-4xl h-[80vh] overflow-hidden ${isExpandedTextboxClosing ? "animate-out fade-out-0 zoom-out-95 duration-200 ease-in-out" : "animate-in fade-in-0 zoom-in-95 duration-200 ease-in-out"}`}><div className="flex items-center justify-between p-4 border-b border-gray-200"><h2 className="text-lg font-semibold text-gray-900"> </h2><button onClick={handleCloseExpandedTextbox} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"><svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div><div className="p-4 h-full"><Textarea value={inputText} onChange={handleInputChange} placeholder="여기에 글의 주제나 내용을 입력해주세요..." className="w-full h-[calc(100%-60px)] resize-none p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-base leading-relaxed" /></div></div></div>)}
      </div>
    </div>
  )
}