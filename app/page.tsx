"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import './components.css'
import { PenTool, Sparkles, ArrowLeft, ChevronDown, ChevronUp, CheckCircle, Circle, Clock, Copy } from "lucide-react"

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

export default function Component() {
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [placeholderText, setPlaceholderText] = useState("")
  const [isTyping, setIsTyping] = useState(true)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [activeWritingType, setActiveWritingType] = useState("")
  const [expertiseLevel, setExpertiseLevel] = useState([1])
  const [textLength, setTextLength] = useState([1])
  const [textTone, setTextTone] = useState([1])
  const [isTextAnimating, setIsTextAnimating] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [displayedText, setDisplayedText] = useState("")
  const [generatedText, setGeneratedText] = useState("")
  const [inputText, setInputText] = useState("")
  const [originalInputText, setOriginalInputText] = useState("")
  const [processSteps, setProcessSteps] = useState<ProcessStep[]>([])
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [showProcessMap, setShowProcessMap] = useState(false)
  const [isTextareaFocused, setIsTextareaFocused] = useState(false)
  const [showHelpTooltip, setShowHelpTooltip] = useState(false)
  const [showCopyMessage, setShowCopyMessage] = useState(false)
  const [isTextModified, setIsTextModified] = useState(false)
  const [sources, SetSources] = useState<Source[]>([])
  const [isRecentPostsOpen, setIsRecentPostsOpen] = useState(false)

  // 계정 정보 더미 데이터
  const accountInfo = {
    name: "Admin",
    email: "aaa@example.com",
    avatar: "/placeholder.svg?height=40&width=40",
    plan: "Primiun",
  }

  // 최근 글 목록 더미 데이터
  const recentPosts = [
    {
      id: 1,
      title: "한국 주식시장 동향 분석",
      preview: "최근 3개월간 한국 주식시장은 글로벌 경제 불확실성과...",
      createdAt: "2024-01-15",
      type: "리포트",
    },
    {
      id: 2,
      title: "AI 기술의 미래 전망",
      preview: "인공지능 기술이 빠르게 발전하면서 다양한 산업 분야에서...",
      createdAt: "2024-01-14",
      type: "칼럼",
    },
    {
      id: 3,
      title: "친환경 에너지 정책 리뷰",
      preview: "정부의 새로운 친환경 에너지 정책이 발표되면서...",
      createdAt: "2024-01-13",
      type: "리뷰",
    },
  ]

  const writingTypes = [
    { id: "academic", label: "학술", expertise: [4], length: [3], tone: [4] },
    { id: "review", label: "리뷰", expertise: [2], length: [3], tone: [0] },
    { id: "daily", label: "일상", expertise: [1], length: [2], tone: [0] },
    { id: "column", label: "칼럼", expertise: [4], length: [4], tone: [1] },
    { id: "general", label: "일반", expertise: [2], length: [2], tone: [2] },
  ]

  const createInitialSteps = (): ProcessStep[] => [
    {
      id: "analyze",
      title: "종합적 요구사항 분석",
      description: "주제, 목적, 요구사항을 파악하고 있습니다",
      status: "pending",
    },
    {
      id: "plan",
      title: "계획 수립",
      description: "정교한 글 구조를 계획하고 있습니다",
      status: "pending",
    },
    {
      id: "draft",
      title: "자료 수집",
      description: "필요한 자료를 수집하고 있습니다",
      status: "pending",
    },
    {
      id: "write",
      title: "본문 작성",
      description: "글의 본문을 작성하고 있습니다",
      status: "pending",
    },
    {
      id: "finalize",
      title: "검토 및 피드백",
      description: "글을 개선하고 있습니다",
      status: "pending",
    },
  ]

  // 프로세스 단계 업데이트 함수
  const updateProcessStep = (stepIndex: number) => {
    const currentStep = processSteps[stepIndex]

    // 단계 상태 업데이트
    setProcessSteps((prevSteps) =>
      prevSteps.map((step, index) => {
        if (index < stepIndex) {
          return { ...step, status: "completed" as const }
        } else if (index === stepIndex) {
          return { ...step, status: "processing" as const }
        } else {
          return { ...step, status: "pending" as const }
        }
      }),
    )
  }

  // 프로세스 완료 함수
  const completeAllSteps = () => {
    setProcessSteps((prevSteps) => prevSteps.map((step) => ({ ...step, status: "completed" as const })))
    setShowProcessMap(false)
    setIsGenerating(false)
  }

  // 프로세스 시작 함수
  const startProcessing = async () => {
    // 초기화
    const initialSteps = createInitialSteps()
    setProcessSteps(initialSteps)
    setCurrentStepIndex(0)
    setShowProcessMap(true)
    setIsGenerating(true)
    setOriginalInputText(inputText)

    updateProcessStep(0)

    try {
      // 1. 백엔드에 POST 요청 (fetch API 사용)
      const response = await fetch('https://ai-writing-web.vercel.app/generate-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputText, expertiseLevel, textLength, textTone }),
      });

      if (!response.body) return;

      // 2. 응답 스트림을 읽기 위한 Reader 생성
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // 3. 스트림 데이터를 실시간으로 읽어오기
      while (true) {
        const { done, value } = await reader.read();
        if (done) break; // 스트림 종료

        const chunk = decoder.decode(value);
        
        // SSE는 여러 'data:' 이벤트를 한 번에 보낼 수 있으므로 분리해서 처리
        const lines = chunk.split('\n\n').filter(line => line.trim() !== '');
        for (const line of lines) {
          if (line.startsWith('data:')) {
            const jsonString = line.replace('data: ', '');
            const data = JSON.parse(jsonString);

            if(data.text) {
              setGeneratedText(data.text); //차후 sources에 출처 데이터 집어넣기 + 실시간 카테고리추가, 주제 조언
              completeAllSteps()
              return;
            }
            if(data.process) {
                updateProcessStep(Number(data.process))
            }
            if(data.source) {
              data.source.forEach((s: { web: any }) => { //이거 데이터 안받아와짐 나중에 수정할것
                console.log('Source:', s.web);
                const source: Source = {
                  title: s.web.title || "알 수 없음",
                  url: s.web.uri,
                }
                SetSources((prevSources) => [...prevSources, source]);
              })
            }
          }
        }

      }
    } catch (error) {
      console.error('Error fetching AI stream:', error);
    } finally {

    }
  }

  const handleSubmit = () => {
    setIsSettingsOpen(false)
    setIsSubmitted(true)
    setIsTextAnimating(false)
    setIsRecentPostsOpen(false)
    setDisplayedText("")
    setGeneratedText("")

    // 프로세스 시작
    startProcessing()
  }

  // 결과 출력 애니메이션
  useEffect(() => {
    if (generatedText && !isGenerating) {
      setIsTextAnimating(true)
      setDisplayedText("")

      let currentIndex = 0
      const animateText = () => {
        if (currentIndex < generatedText.length) {
          setDisplayedText(generatedText.slice(0, currentIndex + 1))
          currentIndex+= 8
          setTimeout(animateText, 5)
        } else {
          setDisplayedText(generatedText)
          setIsTextAnimating(false)
        }
      }

      setTimeout(animateText, 100)
    }
  }, [generatedText, isGenerating])

  // 텍스트 변경 감지
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    setInputText(newValue)

    // 제출된 상태에서 텍스트가 변경되었는지 확인
    if (isSubmitted && newValue != originalInputText) {
      setIsTextModified(true)
    } else if (isSubmitted && newValue == originalInputText) {
      setIsTextModified(false)
    }
  }

  // 복사하기 함수
  const handleCopy = async () => {
    try {
      const originalGeneratedText = generatedText.replace(/\[\d+\]/g, "")
      await navigator.clipboard.writeText(originalGeneratedText)
      setShowCopyMessage(true)

      // 3초 후 메시지 숨김
      setTimeout(() => {
        setShowCopyMessage(false)
      }, 3000)
    } catch (error) {
      console.error("복사 실패:", error)
      // 폴백: 텍스트 선택 방식
      const textArea = document.createElement("textarea")
      textArea.value = generatedText
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand("copy")
      document.body.removeChild(textArea)

      setShowCopyMessage(true)
      setTimeout(() => {
        setShowCopyMessage(false)
      }, 3000)
    }
  }

  const handleReset = () => {
    setIsSubmitted(false)
    setIsGenerating(false)
    setOriginalInputText("")
    setGeneratedText("")
    setDisplayedText("")
    setIsTextAnimating(false)
    setShowProcessMap(false)
    setProcessSteps([])
    setCurrentStepIndex(0)
    setIsTextareaFocused(false)
    setIsTextModified(false)
    setIsRecentPostsOpen(false)
  }

  const toggleSettings = () => {
    setIsSettingsOpen(!isSettingsOpen)
  }

  const handleWritingTypeClick = (type: {
    id: string
    label: string
    expertise: number[]
    length: number[]
    tone: number[]
  }) => {
    if (activeWritingType === type.id) {
      setActiveWritingType("")
      setIsSettingsOpen(false)
      setExpertiseLevel([1])
      setTextLength([1])
      setTextTone([1])
    } else {
      const selectedType = writingTypes.find((t) => t.id === type.id)
      if (selectedType) {
        setActiveWritingType(type.id)
        setExpertiseLevel(selectedType.expertise)
        setTextLength(selectedType.length)
        setTextTone(selectedType.tone)
        setIsSettingsOpen(true)
      }
    }
  }

  useEffect(() => {
    const fullText =
      "한국의 주식 동향에 관한 리포트를 작성하세요. 최근 3개월간의 주요 지표와 트렌드를 포함하고, 투자자들에게 유용한 인사이트를 제공해주세요."
    let currentIndex = 0

    const typeText = () => {
      if (isSubmitted) return

      if (currentIndex < fullText.length) {
        setPlaceholderText(fullText.slice(0, currentIndex + 1))
        currentIndex += 1
        setTimeout(typeText, 50)
      } else {
        setIsTyping(false)
      }
    }

    if (!isSubmitted) {
      typeText()
    }
  }, [isSubmitted])

  // 텍스트에서 출처 번호를 파싱하고 렌더링하는 함수
  const renderTextWithSources = (text: string) => {
    // [숫자] 패턴을 찾는 정규식
    const sourcePattern = /\[(\d+)\]/g
    const parts = []
    let lastIndex = 0
    let match

    while ((match = sourcePattern.exec(text)) !== null) {
      // 출처 번호 앞의 텍스트 추가
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index))
      }

      // 출처 번호 (1부터 시작하므로 -1)
      const sourceIndex = Number.parseInt(match[1]) - 1
      const source = sources[sourceIndex]

      if(source) {
        parts.push(
          <span key={`source-${match.index}`} className="inline-block relative group cursor-pointer">
            <span className="inline-block w-3 h-3 bg-gray-200 border border-gray-200 rounded-sm transition-colors duration-200">
                <div
                  className="absolute inset-0 flex items-center justify-center text-[9px] text-gray-400 cursor-pointer"
                  onClick={() => window.open(source.url, "_blank")}
                  title={source.title}
                >
                  {match[1]}
                </div>
            </span>

            {/* 플로팅 메시지 */}
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
              <div className="bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap">
                {sources[Number(match[1])-1]?.title}
              </div>
              {/* 화살표 */}
              <div className="absolute top-full left-1/2 transform -translate-x-1/2">
                <div className="w-0 h-0 border-l-2 border-r-2 border-t-2 border-l-transparent border-r-transparent border-t-gray-800"></div>
              </div>
            </div>
          </span>
        )
      }

      lastIndex = sourcePattern.lastIndex
    }

    // 마지막 부분의 텍스트 추가
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex))
    }

    return parts
  }

  const getStepIcon = (step: ProcessStep) => {
    switch (step.status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-black" />
      case "processing":
        return <Clock className="w-4 h-4 text-gray-600 animate-spin" />
      default:
        return <Circle className="w-4 h-4 text-gray-300" />
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div
        className={`grid min-h-screen transition-all duration-500 ease-out ${
          isSubmitted ? "grid-cols-[320px_1fr]" : "grid-cols-1"
        }`}
      >
        {/* 최근 글 목록 패널 - 오버레이 방식 */}
        {isRecentPostsOpen && (
          <div className="fixed top-0 left-0 w-[280px] h-full bg-white border-r border-border flex flex-col animate-in slide-in-from-left-full fade-in-0 duration-500 z-50 shadow-lg">
            {/* 계정 정보 - 고정 영역 */}
            <div className="px-4 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center space-x-3 mx-1">
                <img
                  src={accountInfo.avatar || "/placeholder.svg"}
                  alt={accountInfo.name}
                  className="w-10 h-10 rounded-full bg-gray-200"
                />
                <div className="flex-1">
                  <h3 className="font-semibold text-sm">{accountInfo.name}</h3>
                  <p className="text-xs text-muted-foreground">{accountInfo.email}</p>
                </div>
                <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full font-medium">
                  {accountInfo.plan}
                </span>
              </div>
            </div>

            {/* 최근 글 목록 - 스크롤 가능한 영역 */}
            <div className="flex-1 overflow-hidden">
              <div className="px-4 pt-4 h-full flex flex-col">
                <h4 className="font-semibold text-sm mb-3 text-gray-900 flex-shrink-0 px-2">최근 글 목록</h4>
                <div
                  className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar"
                  style={{ maxHeight: "calc(100vh - 200px)" }}
                >
                  {recentPosts.map((post) => (
                    <div
                      key={post.id}
                      className="p-2.5 mx-1 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 cursor-pointer transition-all duration-200 group"
                    >
                      <div className="flex items-start justify-between mb-1.5">
                        <h5 className="font-medium text-sm text-gray-900 group-hover:text-gray-700 line-clamp-1 pr-2">
                          {post.title}
                        </h5>
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full flex-shrink-0">
                          {post.type}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2 mb-1.5">{post.preview}</p>
                      <p className="text-xs text-gray-400">{new Date(post.createdAt).toLocaleDateString("ko-KR")}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 패널이 열려있을 때 배경 오버레이 추가 */}
        {isRecentPostsOpen && (
          <div
            className="fixed inset-0 bg-black/15 z-40 animate-in fade-in-0 duration-300"
            onClick={() => setIsRecentPostsOpen(false)}
          />
        )}

        {/* 왼쪽 입력 영역 */}
        <div
          className={`flex flex-col transition-all duration-5000 ease-out overflow-hidden ${
            isSubmitted ? "p-4 lg:p-6 lg:border-r border-border" : "p-4 lg:p-8 justify-center items-center"
          }`}
        >
          <div
            className={`flex flex-col w-full transition-all duration-5000 ease-out ${
              isSubmitted
                ? "space-y-4 lg:space-y-5 max-w-full lg:max-w-sm"
                : "space-y-4 lg:space-y-6 max-w-full lg:max-w-md"
            }`}
          >
            {/* 로고 */}
            <div
              className={`flex items-center space-x-2 transition-all duration-5000 ease-out ${
                isSubmitted ? "opacity-85" : "opacity-100"
              }`}
            >
              <div className="flex items-center justify-center w-10 h-10 bg-primary rounded-lg">
                <PenTool className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1
                  className={`font-bold transition-all duration-1000 ease-out ${isSubmitted ? "text-xl" : "text-2xl"}`}
                >
                  AI Writer
                </h1>
                <p
                  className={`text-muted-foreground transition-all duration-1000 ease-out ${
                    isSubmitted ? "text-sm" : "text-sm"
                  }`}
                >
                  AI 글쓰기 도우미
                </p>
              </div>
            </div>

            {/* 텍스트 입력 필드 */}
            <div className="space-y-2">
              <Label
                htmlFor="content"
                className={`font-medium transition-all duration-5000 ease-out ${isSubmitted ? "text-sm" : "text-base"}`}
              >
                글 주제를 입력하세요
              </Label>
              <Textarea
                id="content"
                value={inputText}
                onChange={handleInputChange}
                onFocus={() => setIsTextareaFocused(true)}
                onBlur={() => setIsTextareaFocused(false)}
                placeholder={isSubmitted ? "여기에 글의 주제나 내용을 입력해주세요." : placeholderText}
                className={`resize-none transition-all duration-500 ease-out p-4 focus:ring-0 focus:ring-offset-0 focus:border-border font-light border border-slate-300 focus:outline-none ${
                  isSubmitted
                    ? "min-h-[140px] text-sm"
                    : isTextareaFocused || inputText.trim()
                      ? "min-h-[200px]"
                      : "min-h-[120px]"
                }`}
              />

              {/* 글쓰기 유형 버튼들 */}
              <div
                className={`pt-1 transition-all duration-5000 ease-out ${isSubmitted ? "opacity-80" : "opacity-100"}`}
              >
                <div className="flex flex-wrap gap-1.5 justify-start">
                  {writingTypes.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => handleWritingTypeClick(type)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                        activeWritingType === type.id
                          ? "bg-primary text-primary-foreground shadow-md"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      } ${isSubmitted ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-xs"}`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 설정 패널 */}
            <div className={`transition-all duration-1000 ease-out ${isSubmitted ? "opacity-80" : "opacity-100"}`}>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={toggleSettings}
                  className={`w-full flex justify-between p-4 hover:bg-gray-100 transition-colors duration-200 text-black bg-transparent items-center ${
                    isSubmitted ? "p-3" : "p-4"
                  }`}
                >
                  <Label
                    className={`font-medium transition-all duration-1000 ease-out ${
                      isSubmitted ? "text-sm" : "text-base"
                    }`}
                  >
                    글쓰기 설정
                  </Label>
                  {isSettingsOpen ? (
                    <ChevronUp
                      className={`transition-all duration-1000 ease-out ${isSubmitted ? "w-4 h-4" : "w-5 h-5"}`}
                    />
                  ) : (
                    <ChevronDown
                      className={`transition-all duration-1000 ease-out ${isSubmitted ? "w-4 h-4" : "w-5 h-5"}`}
                    />
                  )}
                </button>

                <div
                  className={`overflow-hidden transition-all duration-300 ease-out ${
                    isSettingsOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <div className={`p-4 space-y-6 bg-white ${isSubmitted ? "p-3 space-y-4" : "p-4 space-y-6"}`}>
                    {/* 글 전문성 수준 */}
                    <div className="space-y-3">
                      <Label
                        className={`font-medium transition-all duration-5000 ease-out ${
                          isSubmitted ? "text-sm" : "text-base"
                        }`}
                      >
                        글 전문성 수준
                      </Label>
                      <Slider
                        value={expertiseLevel}
                        onValueChange={setExpertiseLevel}
                        max={4}
                        step={1}
                        defaultValue={[2]}
                        className="w-full"
                      />
                      <div
                        className={`flex justify-between text-muted-foreground transition-all duration-1000 ease-out ${
                          isSubmitted ? "text-xs" : "text-sm"
                        }`}
                      >
                        <span>일반적</span>
                        <span>보통</span>
                        <span>전문적</span>
                      </div>
                    </div>

                    {/* 글 길이 */}
                    <div className="space-y-3">
                      <Label
                        className={`font-medium transition-all duration-5000 ease-out ${
                          isSubmitted ? "text-sm" : "text-base"
                        }`}
                      >
                        글 길이
                      </Label>
                      <Slider value={textLength} onValueChange={setTextLength} max={4} step={1} className="w-full" defaultValue={[2]} />
                      <div
                        className={`flex justify-between text-muted-foreground transition-all duration-1000 ease-out ${
                          isSubmitted ? "text-xs" : "text-sm"
                        }`}
                      >
                        <span>짧게</span>
                        <span>보통</span>
                        <span>길게</span>
                      </div>
                    </div>

                    {/* 글 톤 */}
                    <div className="space-y-3">
                      <Label
                        className={`font-medium transition-all duration-5000 ease-out ${
                          isSubmitted ? "text-sm" : "text-base"
                        }`}
                      >
                        글 톤
                      </Label>
                      <Slider value={textTone} onValueChange={setTextTone} max={4} step={1} defaultValue={[2]} className="w-full" />
                      <div
                        className={`flex justify-between text-muted-foreground transition-all duration-1000 ease-out ${
                          isSubmitted ? "text-xs" : "text-sm"
                        }`}
                      >
                        <span>친근한</span>
                        <span>중립적</span>
                        <span>공식적</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 제출/리셋 버튼 */}
            {!isSubmitted ? (
              <Button
                className="w-full h-12 text-base transition-all duration-5000 ease-out"
                size="lg"
                onClick={handleSubmit}
                disabled={!inputText.trim()}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                AI로 글 다듬기
              </Button>
            ) : (
              <div className="space-y-2">
                <Button
                  className={`w-full h-10 text-sm transition-all duration-500 ease-out ${
                    !isGenerating && isTextModified ? "animate-in fade-in-0 slide-in-from-top-2" : ""
                  }`}
                  onClick={handleSubmit}
                  disabled={isGenerating || !inputText.trim()}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {isGenerating ? "생성 중.." : isTextModified ? "글 피드백" : "글 재생성"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-10 text-sm transition-all duration-5000 ease-out bg-transparent"
                  onClick={handleReset}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  다시 편집
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽 결과 영역 */}
        {isSubmitted && (
          <div className="flex items-center justify-center bg-muted/20 transition-all ease-out p-4 lg:p-12 fade-in-0 duration-500">
            <div className="w-full max-w-full lg:max-w-4xl space-y-4 lg:space-y-6">
              <div className="flex items-center space-x-3 mb-8">
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary-foreground" />
                </div>
                <h2 className="text-2xl font-bold">
                  {showProcessMap ? "AI가 글을 작성하고 있습니다" : "AI가 다듬은 결과"}
                </h2>
              </div>

              <div className="bg-white rounded-lg border p-4 lg:p-8 shadow-sm">
                {showProcessMap ? (
                  <div className="py-8">
                    <div className="max-w-sm mx-auto space-y-3">
                      {processSteps.map((step, index) => (
                        <div
                          key={step.id}
                          className={`flex items-center space-x-3 py-2 px-3 rounded transition-all duration-500 ${
                            step.status === "processing"
                              ? "bg-gray-50"
                              : step.status === "completed"
                                ? "bg-gray-100"
                                : "bg-white"
                          }`}
                        >
                          <div className="flex-shrink-0">{getStepIcon(step)}</div>
                          <div className="flex-1 min-w-0">
                            <h3
                              className={`font-medium text-sm ${
                                step.status === "processing"
                                  ? "text-gray-800"
                                  : step.status === "completed"
                                    ? "text-black"
                                    : "text-gray-400"
                              }`}
                            >
                              {step.title}
                            </h3>
                            <p
                              className={`text-xs mt-0.5 ${
                                step.status === "processing"
                                  ? "text-gray-600"
                                  : step.status === "completed"
                                    ? "text-gray-600"
                                    : "text-gray-300"
                              }`}
                            >
                              {step.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="prose max-w-none">
                    <div className="text-gray-800 leading-relaxed whitespace-pre-line">
                      {renderTextWithSources(displayedText)}
                      {isTextAnimating && <span className="animate-pulse ml-1 text-gray-400">|</span>}
                    </div>
                  </div>
                )}
              </div>

              {!isGenerating && displayedText && !isTextAnimating && !showProcessMap && (
                <div className="space-y-4">

                  {sources.length>0 && (
                    // 출처 섹션
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-gray-700">참고 출처</h3>
                      <div className="flex flex-wrap gap-2">
                        {sources.map((source, index) => (
                          <button
                            key={index}
                            onClick={() => window.open(source.url, "_blank")} //pxpy 3.5, 1.5에서 줄임
                            className="inline-flex items-center px-2.5 py-1 bg-white border border-gray-200 rounded-full text-xs text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors duration-200 shadow-sm"
                            title={source.title}
                          >
                            {source.title.slice(0, 4)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 복사하기 버튼 */}
                  <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4 transition-all duration-1000 ease-out opacity-100 translate-y-0">
                    <Button
                      variant="outline"
                      onClick={handleCopy}
                      className="flex items-center space-x-2 bg-transparent"
                    >
                      <Copy className="w-4 h-4" />
                      <span>복사하기</span>
                    </Button>
                  </div>
                </div>
              )}

              {/* 복사 완료 플로팅 메시지 */}
              {showCopyMessage && (
                <div className="fixed top-6 right-6 z-50 animate-in fade-in-0 slide-in-from-top-2 duration-300">
                  <div className="bg-black text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">복사되었습니다</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 최근 글 목록 아이콘 (메인 화면에서만 표시) */}
        {!isSubmitted && (
          <div className="fixed bottom-6 left-6 z-50">
            <button
              onClick={() => setIsRecentPostsOpen(!isRecentPostsOpen)}
              className="w-10 h-10 text-gray-500 hover:text-gray-700 transition-colors duration-200 flex items-center justify-center hover:scale-105"
              title="최근 글 목록"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </button>
          </div>
        )}

        {/* 플로팅 도움말 버튼 */}
        <div className="fixed bottom-6 right-6 z-50">
          <div className="relative">
            <button
              onMouseEnter={() => setShowHelpTooltip(true)}
              onMouseLeave={() => setShowHelpTooltip(false)}
              className="w-10 h-10 bg-primary text-primary-foreground rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center hover:scale-105"
            >
              ?
            </button>

            {/* 툴팁 */}
            {showHelpTooltip && (
              <div className="absolute bottom-full right-0 mb-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-gray-900">AI Writer 사용법</h3>
                  <div className="space-y-2 text-xs text-gray-600">
                    <div className="flex items-start space-x-2">
                      <span className="w-1 h-1.5 bg-primary rounded-full mt-1.5 flex-shrink-0"></span>
                      <span>글 주제와 목적을 입력하고 원하는 글쓰기 유형을 선택하세요</span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <span className="w-1 h-1.5 bg-primary rounded-full mt-1.5 flex-shrink-0"></span>
                      <span>전문성 수준, 글 길이, 톤을 조절하여 맞춤 설정이 가능합니다</span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <span className="w-1 h-1.5 bg-primary rounded-full mt-1.5 flex-shrink-0"></span>
                      <span>AI가 5단계 프로세스를 거쳐 고품질의 글을 생성합니다</span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <span className="w-1 h-1.5 bg-primary rounded-full mt-1.5 flex-shrink-0"></span>
                      <span>결과가 마음에 들지 않으면 기존 텍스트를 수정 후 '글 재생성' 버튼으로 다시 시도하세요</span>
                    </div>
                  </div>
                </div>
                {/* 툴팁 화살표 */}
                <div className="absolute bottom-0 right-4 transform translate-y-full">
                  <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-white"></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
