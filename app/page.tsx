"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import TruckLoader from "./components/loadingTruck.jsx"
import { PenTool, Sparkles, ArrowLeft, ChevronDown, ChevronUp, CheckCircle, Circle, Clock, Copy } from "lucide-react"

import "./components.css"

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
  const [showMoreTypes, setShowMoreTypes] = useState(false)
  const [showUpdateLog, setShowUpdateLog] = useState(false)
  const [showError, setShowError] = useState("")
  const [showExpandedTextbox, setShowExpandedTextbox] = useState(false)
  const [isDraftTextGenerating, setIsDraftTextGenerating] = useState(false)
  const [isUpdateLogClosing, setIsUpdateLogClosing] = useState(false)
  const [isExpandedTextboxClosing, setIsExpandedTextboxClosing] = useState(false)

  const [mockFeedbacks, setMockFeedbacks] = useState<string[]>([])
  const [currentMockIndex, setCurrentMockIndex] = useState(0)
  const [showMockFeedback, setShowMockFeedback] = useState(false)

  const svgStyle = {
    shapeRendering: "geometricPrecision",
    textRendering: "geometricPrecision",
    imageRendering: "optimizeQuality",
    fillRule: "evenodd",
    clipRule: "evenodd",
  }

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

  // 업데이트 로그 더미 데이터
  const updateLogs = [
    {
      version: "v2.0.0",
      date: "2025.07.08",
      title: "초안 생성기능 추가 & 피드백 개선",
      changes: ["'AI 초안 생성' 버튼추가", "내부 프로세스 개선"],
      devNote: "가장 유의미한 업데이트이므로 2.0.0 버전으로 업그레이드 되었습니다",
    },
    {
      version: "v1.0.7",
      date: "2025.07.08",
      title: "AI 피드백 및 UI 대폭 개선",
      changes: ["피드백 처리절차 수정", "로딩바 추가"],
      devNote: "글쓰기 피드백 기능을 강화하였습니다",
    },
    {
      version: "v1.0.6",
      date: "2025.07.08",
      title: "AI 추천 기능 및 UI 개선",
      changes: [
        "AI 추천 글쓰기 유형 버튼 추가",
        "텍스트 입력 시 자동 확장 기능 개선",
        "더보기 버튼 호버 패널 안정성 향상",
        "모바일 반응형 디자인 최적화",
      ],
      devNote: "더욱 직관적인 인터페이스와 새로운 기능을 준비중입니다.",
    },
    {
      version: "v1.0.5",
      date: "2025.07.07",
      title: "성능 최적화 및 버그 수정",
      changes: ["AI 응답 속도 향상", "피드백 처리절차 개선", "기타 버그 수정 및 UI 개선"],
      devNote: "더 빠르고 안정적인 서비스를 위해 백엔드 최적화를 진행했습니다.",
    },
    {
      version: "v1.0.0",
      date: "2025.07.06",
      title: "서비스 오픈 - AI 글쓰기 도우미",
      changes: [
        "Gemini Pro 기반 AI 엔진 적용",
        "실시간 글 생성 프로세스 시각화",
        "출처 자동 인용 기능 추가",
        "글쓰기 유형별 맞춤 설정 강화",
      ],
      devNote: "AI 도우미로 정교한 글쓰기를 지원합니다",
    },
  ]

  const exampleText = `
안녕하세요. 오늘은 수능 생윤 과목의 사상가 중 한명인 임마누엘 칸트의 사상에 대하여 알아볼것입니다.

우선 칸트는 18세기 철학자입니다. 그는 엄격한 시간관리를 하는 사람으로 유명한데요, 그에 관련한 아주 유명한 일화를 하나 들자면 마을 사람들은 그가 정각에 산책을 나오지 않으면 시계를 의심하였다고 합니다.

그러한 칸트의 사상으로는 '선의지'가 있습니다. 선의지란, 여타 모든것에 얽매이지 않고 오직 '도덕법칙에 대한 존경'만으로 그 행위를 해야한다는 개념인데요, 칸트는 이 선의지만이 무조건적으로 옳다고 주장하였습니다.

그렇다면 어떤 것이 도덕법칙이 될 수 있을까요? 이것에 관해 칸트는 '네 행위의 준칙이 보편적 입법의 원리에 부합하도록 행위하여라' 라고 말하였습니다. 여기서 '보편적 입법의 원리에 부합'한다는 것은, 만일 내 행위를 모든 사람들이 따라했을때에 문제가 생기지 않는다는것을 의미합니다

이상입니다. 감사합니다.
`

  const writingTypes = [
    { id: "academic", label: "학술", expertise: [4], length: [3], tone: [4] },
    { id: "review", label: "리뷰", expertise: [2], length: [3], tone: [0] },
    { id: "daily", label: "일상", expertise: [1], length: [2], tone: [0] },
    { id: "column", label: "칼럼", expertise: [4], length: [4], tone: [1] },
    { id: "general", label: "일반", expertise: [2], length: [2], tone: [2] },
    { id: "business", label: "비즈니스", expertise: [3], length: [3], tone: [3] },
    { id: "creative", label: "창작", expertise: [2], length: [4], tone: [1] },
    { id: "technical", label: "기술", expertise: [4], length: [3], tone: [4] },
    { id: "news", label: "뉴스", expertise: [3], length: [2], tone: [3] },
    { id: "blog", label: "블로그", expertise: [1], length: [2], tone: [0] },
  ]

  const createInitialSteps = (): ProcessStep[] => [
    {
      id: "analyze",
      title: "종합적 요구사항 분석",
      description: "주제, 목적, 요구사항을 파악하고 있습니다",
      status: "pending",
    },
    {
      id: "feedback",
      title: "글 피드백",
      description: "다양한 기준에 맞추어 글을 점검하고 있습니다",
      status: "pending",
    },
    {
      id: "rewrite",
      title: "글 피드백",
      description: "모든 요청을 반영중입니다",
      status: "pending",
    },
  ]

  // 프로세스 단계 업데이트 함수
  const updateProcessStep = (stepIndex: number) => {
    const currentStep = processSteps[stepIndex]

    setCurrentStepIndex(stepIndex)
    console.log(stepIndex)

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

  // 프로세스 시작 함수

  const generateUrl = "https://ai-writing-web.vercel.app/api/rewrite"
  const startProcessing = async () => {
    // 초기화
    const initialSteps = createInitialSteps()
    setProcessSteps(initialSteps)
    setCurrentStepIndex(0)
    setShowProcessMap(true)
    setIsGenerating(true)
    setOriginalInputText(inputText)
    setMockFeedbacks([]) // mock 피드백 초기화
    setCurrentMockIndex(0)
    setShowMockFeedback(false)

    updateProcessStep(0)

    try {
      // 1. 백엔드에 POST 요청 (fetch API 사용)
      const response = await fetch(generateUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputText, expertiseLevel, textLength, textTone }),
      })

      if (!response.body) return

      // 2. 응답 스트림을 읽기 위한 Reader 생성
      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      // 3. 스트림 데이터를 실시간으로 읽어오기
      while (true) {
        const { done, value } = await reader.read()
        if (done) break // 스트림 종료

        const chunk = decoder.decode(value)

        // SSE는 여러 'data:' 이벤트를 한 번에 보낼 수 있으므로 분리해서 처리
        const lines = chunk.split("\n\n").filter((line) => line.trim() !== "")
        for (const line of lines) {
          if (line.startsWith("data:")) {
            const jsonString = line.replace("data: ", "")
            const data = JSON.parse(jsonString)

            if (data.text) {
              setGeneratedText(data.text)
              
              setProcessSteps((prevSteps) => prevSteps.map((step) => ({ ...step, status: "completed" as const })))
              setShowProcessMap(false)
              setIsGenerating(false)
              return
            }
            if (data.process) {
              updateProcessStep(Number(data.process))
            }
            if(data.rewritten) {
              console.log(data.rewritten)
            }
            if (data.diagnostics) {
              const diagnostics = data.diagnostics
              diagnostics.forEach((dia: any) => {
                const diagnosticString = `${dia.original_text_segment} \n${dia.issue_type}`
                setMockFeedbacks((prev)=> [...prev, diagnosticString])
              })
              setShowMockFeedback(true)
            }
          }
        }
      }
    } catch (error) {
      console.error("Error fetching AI stream:", error)
    } finally {
    }
  }

  const generateDraftUrl = "https://ai-writing-web.vercel.app/api/draft"
  const startDraftProcessing = async () => {

    try {
      const response = await fetch(generateDraftUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputText, expertiseLevel, textLength, textTone }),
      })
      if (!response.body) return

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)

        const lines = chunk.split("\n\n").filter((line) => line !== "")
        for (const line of lines) {
          if (line.startsWith("data:")) {
            const jsonString = line.replace("data: ", "")
            const data = JSON.parse(jsonString)

            if (data.text) {
              setInputText(data.text.draft)
              setIsDraftTextGenerating(false)
              return
            }
            if (data.source) {
              data.source.forEach((s: { web: any }) => {
                const source: Source = {
                  title: s.web.title || "알 수 없음",
                  url: s.web.uri,
                }
                SetSources((prevSources) => [...prevSources, source])
              })
            }

          }
        }
      }
    } catch (error) {
      console.error("Error fetching AI stream:", error)
    } finally {
    }
  }

  const handleSubmit = () => {
    if(isGenerating) return
    if (inputText.length < 50) {
      setShowError(`초안 길이 부족|초안의 길이는 최소 50자가 넘어야 합니다.
                    <button
                      className="text-red-600 underline font-medium ml-1"
                      onClick={() => {
                        setInputText(exampleText)
                        setShowError("")
                      }}
                    >
                      이곳
                    </button>
                    을 눌러 초안을 자동으로 생성해보세요`)
      return
    }

    setIsSettingsOpen(false)
    setIsSubmitted(true)
    setIsTextAnimating(false)
    setIsRecentPostsOpen(false)
    setDisplayedText("")
    setGeneratedText("")
    setShowError("")

    // 프로세스 시작
    startProcessing()
  }

  const handleDraftTextClick = () => {
    if(isDraftTextGenerating) {
      setShowError("오류|이미 초안이 생성중입니다")
      return
    }
    if(inputText.length < 10) {
      setShowError("초안 길이 부족|초안을 생성하려면 주제, 목적 등을 포함해 최소 10자가 넘어야 합니다")
      return
    }

    setIsDraftTextGenerating(true)
    setShowError("")

    startDraftProcessing()
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
          currentIndex += 8
          setTimeout(animateText, 5)
        } else {
          setDisplayedText(generatedText)
          setIsTextAnimating(false)
        }
      }

      setTimeout(animateText, 100)
    }
  }, [generatedText, isGenerating])

  // 텍스트박스 변경 핸들러
  const textRef = useRef<any>(null)
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    setInputText(newValue)

    // 제출된 상태에서 텍스트가 변경되었는지 확인
    if (isSubmitted && newValue != originalInputText) {
      setIsTextModified(true)
    } else if (isSubmitted && newValue == originalInputText) {
      setIsTextModified(false)
    }

    //텍스트박스 자동 늘리기
    setInputText(e.target.value)
    if (textRef.current) {
      textRef.current.style.height = `auto`
      textRef.current.style.height = `${textRef.current.scrollHeight}px`
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
    const fullText = exampleText
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

      if (source) {
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
                {sources[Number(match[1]) - 1]?.title}
              </div>
              {/* 화살표 */}
              <div className="absolute top-full left-1/2 transform -translate-x-1/2">
                <div className="w-0 h-0 border-l-2 border-r-2 border-t-2 border-l-transparent border-r-transparent border-t-gray-800"></div>
              </div>
            </div>
          </span>,
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

  const handleCloseUpdateLog = () => {
    setIsUpdateLogClosing(true)
    setTimeout(() => {
      setShowUpdateLog(false)
      setIsUpdateLogClosing(false)
    }, 200)
  }

  const handleCloseExpandedTextbox = () => {
    setIsExpandedTextboxClosing(true)
    setTimeout(() => {
      setShowExpandedTextbox(false)
      setIsExpandedTextboxClosing(false)
    }, 200)
  }

  // Mock 피드백 애니메이션 효과
  useEffect(() => {
    if (showMockFeedback && mockFeedbacks.length > 1) {
      const interval = setInterval(() => {
        setCurrentMockIndex((prevIndex) => {
          if (prevIndex < mockFeedbacks.length - 1) {
            return prevIndex + 1
          } else {
            // 모든 mock이 끝나면 다시 처음부터 반복
            return 0
          }
        })
      }, 2000) // 2초마다 변경

      return () => clearInterval(interval)
    }
  }, [showMockFeedback, mockFeedbacks.length])

  return (
    <div className="min-h-screen bg-background">
      <div
        className={`min-h-screen transition-all duration-300 ease-out ${
          isSubmitted ? "md:grid md:grid-cols-[320px_1fr] flex flex-col" : "grid grid-cols-1"
        }`}
      >
        {/* 최근 글 목록 패널 - 오버레이 방식 */}
        {isRecentPostsOpen && (
          <div
            className={`fixed top-0 left-0 w-full md:w-[280px] h-full bg-white border-r border-border flex flex-col ${!isRecentPostsOpen ? "animate-out slide-out-to-left-full fade-out-0 duration-300" : "animate-in slide-in-from-left-full fade-in-0 duration-300"} z-50 shadow-lg`}
          >
            {/* 계정 정보 - 고정 영역 */}
            <div className="border-b border-border flex-shrink-0 px-4 py-2.5"></div>

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
            onClick={() => {
              setIsRecentPostsOpen(false)
            }}
          />
        )}

        {/* 왼쪽 입력 영역 */}
        <div
          className={`flex flex-col transition-all duration-300 ease-out overflow-hidden ${
            isSubmitted ? "p-3 md:p-4 lg:p-6 md:border-r border-border" : "p-4 md:p-8 justify-center items-center"
          }`}
        >
          <div
            className={`flex flex-col w-full transition-all duration-300 ease-out ${
              isSubmitted
                ? "space-y-4 lg:space-y-5 max-w-full lg:max-w-sm"
                : "space-y-4 lg:space-y-6 max-w-full lg:max-w-xl"
            }`}
          >
            {/* 로고 */}
            <div
              className={`flex flex-col space-y-2 transition-all duration-300 ease-out ${
                isSubmitted ? "opacity-85" : "opacity-100"
              }`}
            >
              <div className="flex items-center space-x-2">
                <div className="flex items-center justify-center w-8 md:w-10 h-8 md:h-10 bg-primary rounded-lg">
                  <PenTool className="w-4 md:w-5 h-4 md:h-5 text-primary-foreground" />
                </div>

                <div>
                  <h1
                    className={`font-bold transition-all duration-300 ease-out ${
                      isSubmitted ? "text-lg md:text-xl" : "text-xl md:text-2xl"
                    }`}
                  >
                    AI Writer
                  </h1>
                  <div className="flex items-center space-x-2">
                    <p className="text-xs md:text-sm text-muted-foreground">AI 글쓰기 도우미</p>
                    {!isSubmitted && (
                      <button
                        onClick={() => setShowUpdateLog(true)}
                        className="flex items-center space-x-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors duration-200 group"
                      >
                        <span className="text-xs text-gray-600 font-medium">{updateLogs[0].version}</span>
                        <span className="text-xs text-gray-500">새로운 기능</span>
                        <ChevronDown className="w-3 h-3 text-gray-400 group-hover:text-gray-600 transition-colors" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 텍스트 입력 필드 */}
            <div className="space-y-2">
              <Label
                htmlFor="content"
                className={`font-medium transition-all duration-300 ease-out ${isSubmitted ? "text-sm" : "text-base"}`}
              >
                글 주제를 입력하세요
              </Label>
              <div className="relative">
                <Textarea
                  id="content"
                  value={inputText}
                  onChange={handleInputChange}
                  onFocus={() => {
                    setIsTextareaFocused(true)
                    setShowError("")
                  }}
                  onBlur={() => setIsTextareaFocused(false)}
                  ref={textRef}
                  placeholder={isSubmitted ? "여기에 글의 주제나 내용을 입력해주세요." : placeholderText}
                  className={`resize-none transition-all duration-400 ease-out p-3 md:p-4 focus:ring-0 focus:ring-offset-0 focus:border-border font-light border-slate-300 focus:outline-none text-sm md:text-base border ${
                    isSubmitted
                      ? "min-h-[120px] md:min-h-[140px]"
                      : isTextareaFocused || inputText
                        ? "md:min-h-[200px] w-full transform"
                        : "min-h-[120px] w-full transform scale-100"
                  } ${inputText.length > 100 ? "min-h-[250px] md:min-h-[300px]" : ""} ${
                    inputText.length > 300 ? "min-h-[350px] md:min-h-[400px]" : ""
                  } ${inputText.length > 500 ? "min-h-[450px] md:min-h-[500px]" : ""}`}
                />

                {/* 크게보기 버튼 */}
                <button
                  onClick={() => {
                    setShowExpandedTextbox(true)
                  }}
                  className="absolute bottom-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 transition-colors duration-200"
                  title="크게보기"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                    />
                  </svg>
                </button>
              </div>

              {/* 글쓰기 유형 버튼들 */}
              <div
                className={`pt-1 transition-all duration-300 ease-out ${isSubmitted ? "opacity-80" : "opacity-100"}`}
              >
                <div className="flex flex-wrap gap-2 justify-start relative">
                  {/* AI추천 버튼 (그라데이션 효과) */}
                  {(
                    <button
                      onClick={() => handleDraftTextClick()}
                      className={`ease-in-out px-3 py-1.5 rounded-full text-sm md:text-xs font-medium transition-all duration-500 min-h-[30px] md:min-h-auto relative animate-in fade-in-0 overflow-hidden 
                        "bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300"}`}
                    >
                      <span className="relative z-10">AI 초안 작성</span>
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-300 via-indigo-500 to-sky-200 opacity-20"></div>
                    </button>
                  )}

                  {/* 일반 버튼들 (처음 3개) */}
                  {writingTypes.slice(1, 5).map((type) => (
                    <button
                      key={type.id}
                      onClick={() => handleWritingTypeClick(type)}
                      className={`px-3 py-1.5 rounded-full text-sm md:text-xs font-medium transition-all duration-200 min-h-[30px] md:min-h-auto ${
                        activeWritingType === type.id
                          ? "bg-primary text-primary-foreground shadow-md"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300"
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}

                  {/* 더보기 버튼 */}
                  <div className="relative">
                    <button
                      className="px-3 py-1.5 rounded-full text-sm md:text-xs font-medium transition-all duration-200 min-h-[30px] md:min-h-auto bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300"
                      onClick={() => setShowMoreTypes(!showMoreTypes)}
                    >
                      더보기
                    </button>

                    {/* 툴팁 형태의 추가 버튼들 */}
                    {showMoreTypes && (
                      <div
                        className="absolute animate-in fade-in-0 top-full left-0 mt-2 opacity-100 transition-opacity duration-200 z-10"
                        onMouseLeave={() => setShowMoreTypes(false)}
                      >
                        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[200px]">
                          <div className="flex flex-wrap gap-2">
                            {writingTypes.slice(4).map((type) => (
                              <button
                                key={type.id}
                                onClick={() => handleWritingTypeClick(type)}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                                  activeWritingType === type.id
                                    ? "bg-primary text-primary-foreground shadow-md"
                                    : "bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300"
                                }`}
                              >
                                {type.label}
                              </button>
                            ))}
                          </div>
                          {/* 툴팁 화살표 */}
                          <div className="absolute bottom-full left-4 transform translate-y-1">
                            <div className="w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-white"></div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 설정 패널 */}
            <div className={`transition-all duration-300 ease-out ${isSubmitted ? "opacity-80" : "opacity-100"}`}>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={toggleSettings}
                  className={`w-full flex justify-between p-4 hover:bg-gray-100 transition-colors duration-200 text-black bg-transparent items-center ${
                    isSubmitted ? "p-3" : "p-4"
                  }`}
                >
                  <Label
                    className={`font-medium transition-all duration-300 ease-out ${
                      isSubmitted ? "text-sm" : "text-base"
                    }`}
                  >
                    글쓰기 설정
                  </Label>
                  {isSettingsOpen ? (
                    <ChevronUp
                      className={`transition-all duration-300 ease-out ${isSubmitted ? "w-4 h-4" : "w-5 h-5"}`}
                    />
                  ) : (
                    <ChevronDown
                      className={`transition-all duration-300 ease-out ${isSubmitted ? "w-4 h-4" : "w-5 h-5"}`}
                    />
                  )}
                </button>

                <div
                  className={`overflow-hidden transition-all duration-300 ease-out ${
                    isSettingsOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <div className={`p-4 space-y-6 bg-white ${isSubmitted ? "p-3 space-y-4" : "p-4 space-y-6"}`}>
                    {/* 글 전문성 */}
                    <div className="space-y-3">
                      <Label
                        className={`font-medium transition-all duration-300 ease-out ${
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
                        className={`flex justify-between text-muted-foreground transition-all duration-300 ease-out ${
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
                        className={`font-medium transition-all duration-300 ease-out ${
                          isSubmitted ? "text-sm" : "text-base"
                        }`}
                      >
                        글 길이
                      </Label>
                      <Slider
                        value={textLength}
                        onValueChange={setTextLength}
                        max={4}
                        step={1}
                        className="w-full"
                        defaultValue={[2]}
                      />
                      <div
                        className={`flex justify-between text-muted-foreground transition-all duration-300 ease-out ${
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
                        className={`font-medium transition-all duration-300 ease-out ${
                          isSubmitted ? "text-sm" : "text-base"
                        }`}
                      >
                        톤 앤 매너
                      </Label>
                      <Slider
                        value={textTone}
                        onValueChange={setTextTone}
                        max={4}
                        step={1}
                        defaultValue={[2]}
                        className="w-full"
                      />
                      <div
                        className={`flex justify-between text-muted-foreground transition-all duration-300 ease-out ${
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
                className="w-full h-12 md:h-12 text-base transition-all duration-300 ease-out"
                size="lg"
                onClick={handleSubmit}
                disabled={!inputText}
              >
                <Sparkles className="w-5 h-5 md:w-4 md:h-4 mr-2" />
                AI로 글 다듬기
              </Button>
            ) : (
              <div className="space-y-3 md:space-y-2">
                <Button
                  className={`w-full h-12 md:h-10 text-base md:text-sm transition-all duration-300 ease-out ${
                    !isGenerating && isTextModified ? "animate-in fade-in-0 slide-in-from-top-2" : ""
                  }`}
                  onClick={handleSubmit}
                  disabled={isGenerating || !inputText}
                >
                  <Sparkles className="w-5 h-5 md:w-4 md:h-4 mr-2" />
                  {isGenerating ? "생성 중.." : isTextModified ? "글 피드백" : "글 재생성"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-12 md:h-10 text-base md:text-sm transition-all duration-300 ease-out bg-transparent"
                  onClick={handleReset}
                >
                  <ArrowLeft className="w-5 h-5 md:w-4 md:h-4 mr-2" />
                  다시 편집
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽 결과 영역 */}
        {isSubmitted && (
          <div className=" items-start justify-center bg-muted/20 transition-all ease-out p-3 md:p-4 lg:p-12 fade-in-0 duration-300 min-h-screen md:min-h-0 md:items-center lg:px-12">
            <div className="w-full max-w-full lg:max-w-4xl space-y-3 md:space-y-4 lg:space-y-6">
              <div className="flex items-center space-x-2 md:space-x-3 mb-4 md:mb-8">
                <div className="w-6 md:w-8 h-6 md:h-8 bg-primary rounded-full flex items-center justify-center">
                  <Sparkles className="w-3 md:w-4 h-3 md:h-4 text-primary-foreground" />
                </div>
                <h2 className="text-lg md:text-2xl font-bold">
                  {showProcessMap ? "AI가 글을 작성하고 있습니다" : "AI가 다듬은 결과"}
                </h2>
              </div>

              <div className="bg-white rounded-lg border p-4 lg:p-8 shadow-sm">
                {showProcessMap ? (
                  <div className="py-8">
                    <div className="max-w-md mx-auto space-y-6">
                      <div className="flex justify-center items-center">
                        <TruckLoader />
                      </div>

                      {/* Mock 피드백 또는 현재 단계 표시 */}
                      <div className="text-center min-h-[80px] flex flex-col justify-center">
                        <h3 className="font-medium text-gray-800 mb-2">{processSteps[currentStepIndex]?.title}</h3>
                        {(showMockFeedback && mockFeedbacks.length > 1) ? (
                          // Mock 피드백 애니메이션
                          <div className="relative overflow-hidden">
                            <div
                              key={currentMockIndex}
                              className="animate-in slide-in-from-bottom-4 fade-in-0 duration-500">
                              <p className="text-sm text-gray-600 leading-relaxed px-4">
                                {mockFeedbacks[currentMockIndex]}
                              </p>
                            </div>
                          </div>) : 
                          (
                            <p className="text-sm text-gray-600">{processSteps[currentStepIndex]?.description}</p>
                          )}
                        <p className="text-xs text-gray-400 mt-2">
                            {currentStepIndex} / {processSteps.length}
                        </p>
                        
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="prose max-w-none">
                    <div className="text-gray-800 leading-relaxed whitespace-pre-line">
                      {renderTextWithSources(displayedText)}
                    </div>
                  </div>
                )}
              </div>

              {!isGenerating && displayedText && !isTextAnimating && !showProcessMap && (
                <div className="space-y-4">
                  {sources.length > 0 && (
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
                  <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4 transition-all duration-300 ease-out opacity-100 translate-y-0">
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
          <div className="fixed bottom-4 md:bottom-6 left-4 md:left-6 z-50">
            <button
              onClick={() => {
                setIsRecentPostsOpen(!isRecentPostsOpen)
              }}
              className="w-12 md:w-10 h-12 md:h-10 text-gray-500 hover:text-gray-700 active:text-gray-800 transition-colors duration-200 flex items-center justify-center hover:scale-105 active:scale-95 bg-white md:bg-transparent rounded-full md:rounded-none shadow-lg md:shadow-none"
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
        <div className="fixed bottom-4 md:bottom-6 right-4 md:right-6 z-50">
          <div className="relative">
            <button
              onMouseEnter={() => showError.length==0 && setShowHelpTooltip(true)}
              onMouseLeave={() => showError.length==0 && setShowHelpTooltip(false)}
              onClick={() => {
                if (showError.length>0) {
                  setShowError("")
                  setShowHelpTooltip(false)
                } else {
                } //도움말 페이지로
              }}
              className={`w-12 md:w-10 h-12 md:h-10 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center hover:scale-105 active:scale-95 text-base md:text-sm ${
                showError.length>0 ? "bg-red-500 text-white" : "bg-primary text-primary-foreground"
              }`}
            >
              {showError.length>0 ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                "?"
              )}
            </button>

            {/* 에러 툴팁 */}
            {showError.length>0 && (
              <div className="absolute bottom-full right-0 mb-2 w-80 bg-red-50 border border-red-200 rounded-lg shadow-lg p-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-red-900">{showError.split("|")[0]}</h3>
                  <p className="text-xs text-red-700">
                    {showError.split("|")[1]}
                  </p>
                </div>
                {/* 툴팁 화살표 */}
                <div className="absolute bottom-0 right-4 transform translate-y-full">
                  <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-red-200"></div>
                </div>
              </div>
            )}

            {/* 기존 도움말 툴팁 */}
            {showHelpTooltip && showError.length==0 && (
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
        {/* 업데이트 로그 팝업 */}
        {showUpdateLog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 ">
            <div
              className={`bg-white rounded-lg shadow-xl max-w-xl w-full overflow-hidden ${isUpdateLogClosing ? "animate-out fade-out-0 zoom-out-95 duration-300" : "animate-in fade-in-0 zoom-in-95 duration-200"}`}
            >
              {/* 헤더 */}
              <div className="flex overflow-hidden items-center justify-between p-6 border-b border-gray-200">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">업데이트 로그</h2>
                  <p className="text-sm text-gray-500 mt-1">AI Writer의 최신 업데이트 내역을 확인하세요</p>
                </div>
                <button
                  onClick={handleCloseUpdateLog}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* 내용 */}
              <div className="max-h-[calc(80vh-120px)] p-6 overflow-y-auto">
                <div className="space-y-6">
                  {updateLogs.map((log, index) => (
                    <div key={log.version} className="relative">
                      {/* 타임라인 라인 */}
                      {index !== updateLogs.length - 1 && (
                        <div className="absolute left-4 top-12 w-0.5 h-full bg-gray-200"></div>
                      )}

                      <div className="flex space-x-4">
                        {/* 버전 아이콘 */}
                        <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                          <span className="text-xs font-bold text-white">
                            {log.version.replace("v", "").split(".")[0]}
                          </span>
                        </div>

                        {/* 내용 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-2">
                            <h3 className="font-semibold text-gray-900">{log.version}</h3>
                            <span className="text-sm text-gray-500">{log.date}</span>
                          </div>

                          <h4 className="font-medium text-gray-800 mb-3">{log.title}</h4>

                          <ul className="space-y-1 mb-4">
                            {log.changes.map((change, changeIndex) => (
                              <li key={changeIndex} className="flex items-start space-x-2 text-sm text-gray-600">
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 flex-shrink-0"></span>
                                <span>{change}</span>
                              </li>
                            ))}
                          </ul>

                          <div className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded-r">
                            <p className="text-sm text-blue-800">
                              <span className="font-medium">Comment:</span> {log.devNote}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* 크게보기 텍스트박스 모달 */}
        {showExpandedTextbox && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div
              className={`bg-white rounded-lg shadow-xl w-full max-w-4xl h-[80vh] overflow-hidden ${isExpandedTextboxClosing ? "animate-out fade-out-0 zoom-out-95 duration-200" : "animate-in fade-in-0 zoom-in-95 duration-200"}`}
            >
              {/* 헤더 */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900"> </h2>
                <button
                  onClick={handleCloseExpandedTextbox}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* 내용 */}
              <div className="p-4 h-full">
                <Textarea
                  value={inputText}
                  onChange={handleInputChange}
                  placeholder="여기에 글의 주제나 내용을 입력해주세요..."
                  className="w-full h-[calc(100%-60px)] resize-none p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-base leading-relaxed"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
