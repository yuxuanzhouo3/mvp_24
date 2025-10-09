"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Plus, Star, Brain, Briefcase, Palette, Code, BookOpen, TrendingUp, Zap } from "lucide-react"

interface GPTLibraryProps {
  selectedGPTs: any[]
  setSelectedGPTs: (gpts: any[]) => void
  language: string
}

export function GPTLibrary({ selectedGPTs, setSelectedGPTs, language }: GPTLibraryProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState("all")

  const t = {
    zh: {
      search: "搜索AI助手...",
      all: "全部",
      technical: "技术",
      creative: "创意",
      business: "商业",
      recommended: "推荐组合",
      add: "添加",
      remove: "移除",
      specialty: "专长",
      rating: "评分",
    },
    en: {
      search: "Search AI assistants...",
      all: "All",
      technical: "Technical",
      creative: "Creative",
      business: "Business",
      recommended: "Recommended Combos",
      add: "Add",
      remove: "Remove",
      specialty: "Specialty",
      rating: "Rating",
    },
  }

  const gptLibrary = [
    // AI Providers Section
    {
      id: "openai-gpt",
      name: "GPT-4",
      role: language === "zh" ? "OpenAI模型" : "OpenAI Model",
      category: "providers",
      color: "bg-green-600",
      rating: 4.9,
      specialty:
        language === "zh"
          ? "通用AI助手，擅长对话和推理"
          : "General AI assistant, excellent at conversation and reasoning",
      icon: Brain,
      description:
        language === "zh"
          ? "OpenAI最新的GPT-4模型，具有强大的理解和生成能力"
          : "OpenAI's latest GPT-4 model with powerful understanding and generation capabilities",
      type: "provider",
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      role: language === "zh" ? "深度求索模型" : "DeepSeek Model",
      category: "providers",
      color: "bg-blue-600",
      rating: 4.8,
      specialty:
        language === "zh" ? "中文优化，代码生成，逻辑推理" : "Chinese optimized, code generation, logical reasoning",
      icon: Code,
      description:
        language === "zh"
          ? "专为中文优化的AI模型，在代码和逻辑推理方面表现出色"
          : "AI model optimized for Chinese, excellent in code and logical reasoning",
      type: "provider",
    },
    {
      id: "morngpt-mix",
      name: "MornGPT-Mix",
      role: language === "zh" ? "混合模型" : "Mixed Model",
      category: "providers",
      color: "bg-purple-600",
      rating: 4.7,
      specialty: language === "zh" ? "多模型融合，综合能力强" : "Multi-model fusion, comprehensive capabilities",
      icon: Zap,
      description:
        language === "zh" ? "融合多个AI模型优势的混合系统" : "Hybrid system combining advantages of multiple AI models",
      type: "provider",
    },

    // AI Organizations Section
    {
      id: "morngpt-research-org",
      name: language === "zh" ? "MornGPT研究组织" : "MornGPT Research Org",
      role: language === "zh" ? "自动化研究团队" : "Automated Research Team",
      category: "organizations",
      color: "bg-indigo-600",
      rating: 4.9,
      specialty:
        language === "zh"
          ? "自动文献调研，数据分析，报告生成"
          : "Automated literature research, data analysis, report generation",
      icon: BookOpen,
      description:
        language === "zh"
          ? "包含研究员、分析师、编辑的自动化研究团队"
          : "Automated research team including researchers, analysts, and editors",
      type: "organization",
      members: ["研究员", "数据分析师", "学术编辑", "文献专家"],
    },
    {
      id: "morngpt-business-org",
      name: language === "zh" ? "MornGPT商业组织" : "MornGPT Business Org",
      role: language === "zh" ? "自动化商业团队" : "Automated Business Team",
      category: "organizations",
      color: "bg-emerald-600",
      rating: 4.8,
      specialty:
        language === "zh" ? "市场分析，战略规划，财务建模" : "Market analysis, strategic planning, financial modeling",
      icon: TrendingUp,
      description:
        language === "zh"
          ? "包含分析师、策略师、财务专家的商业团队"
          : "Business team including analysts, strategists, and financial experts",
      type: "organization",
      members: ["市场分析师", "战略顾问", "财务专家", "商业顾问"],
    },
    {
      id: "morngpt-creative-org",
      name: language === "zh" ? "MornGPT创意组织" : "MornGPT Creative Org",
      role: language === "zh" ? "自动化创意团队" : "Automated Creative Team",
      category: "organizations",
      color: "bg-pink-600",
      rating: 4.7,
      specialty:
        language === "zh" ? "内容创作，品牌策划，设计思维" : "Content creation, brand planning, design thinking",
      icon: Palette,
      description:
        language === "zh"
          ? "包含作家、设计师、策划师的创意团队"
          : "Creative team including writers, designers, and planners",
      type: "organization",
      members: ["创意作家", "设计师", "品牌策划", "内容编辑"],
    },

    // Individual Specialists (existing ones)
    {
      id: 1,
      name: language === "zh" ? "研究员" : "Researcher",
      role: language === "zh" ? "学术研究" : "Academic Research",
      category: "specialists",
      color: "bg-blue-500",
      rating: 4.8,
      specialty:
        language === "zh" ? "数据分析、文献综述、研究方法" : "Data analysis, literature review, research methods",
      icon: BookOpen,
      description:
        language === "zh"
          ? "专业的学术研究助手，擅长数据分析和文献综述"
          : "Professional academic research assistant specializing in data analysis and literature review",
      type: "specialist",
    },
    {
      id: 2,
      name: language === "zh" ? "商业分析师" : "Business Analyst",
      role: language === "zh" ? "商业分析" : "Business Analysis",
      category: "business",
      color: "bg-green-500",
      rating: 4.7,
      specialty:
        language === "zh" ? "市场分析、财务建模、战略规划" : "Market analysis, financial modeling, strategic planning",
      icon: TrendingUp,
      description:
        language === "zh"
          ? "专业的商业分析师，提供市场洞察和战略建议"
          : "Professional business analyst providing market insights and strategic recommendations",
      type: "specialist",
    },
    {
      id: 3,
      name: language === "zh" ? "创意作家" : "Creative Writer",
      role: language === "zh" ? "创意写作" : "Creative Writing",
      category: "creative",
      color: "bg-purple-500",
      rating: 4.9,
      specialty: language === "zh" ? "故事创作、文案写作、内容策划" : "Story creation, copywriting, content planning",
      icon: Palette,
      description:
        language === "zh"
          ? "富有创意的写作助手，擅长各种文体创作"
          : "Creative writing assistant skilled in various writing styles",
      type: "specialist",
    },
    {
      id: 4,
      name: language === "zh" ? "技术专家" : "Tech Expert",
      role: language === "zh" ? "技术咨询" : "Technical Consulting",
      category: "technical",
      color: "bg-orange-500",
      rating: 4.6,
      specialty:
        language === "zh"
          ? "软件开发、系统架构、技术选型"
          : "Software development, system architecture, technology selection",
      icon: Code,
      description:
        language === "zh"
          ? "资深技术专家，提供全面的技术解决方案"
          : "Senior technical expert providing comprehensive technical solutions",
      type: "specialist",
    },
    {
      id: 5,
      name: language === "zh" ? "策略顾问" : "Strategy Consultant",
      role: language === "zh" ? "战略咨询" : "Strategic Consulting",
      category: "business",
      color: "bg-red-500",
      rating: 4.8,
      specialty:
        language === "zh"
          ? "企业战略、组织优化、变革管理"
          : "Corporate strategy, organizational optimization, change management",
      icon: Briefcase,
      description:
        language === "zh"
          ? "专业的战略顾问，帮助企业制定发展战略"
          : "Professional strategy consultant helping businesses develop growth strategies",
      type: "specialist",
    },
    {
      id: 6,
      name: language === "zh" ? "数据科学家" : "Data Scientist",
      role: language === "zh" ? "数据科学" : "Data Science",
      category: "technical",
      color: "bg-indigo-500",
      rating: 4.7,
      specialty:
        language === "zh"
          ? "机器学习、统计分析、数据可视化"
          : "Machine learning, statistical analysis, data visualization",
      icon: Brain,
      description:
        language === "zh"
          ? "专业的数据科学家，擅长从数据中提取洞察"
          : "Professional data scientist skilled at extracting insights from data",
      type: "specialist",
    },
  ]

  const recommendedCombos = [
    {
      name: language === "zh" ? "学术论文写作" : "Academic Paper Writing",
      gpts: [1, 3], // Researcher + Creative Writer
      description:
        language === "zh"
          ? "研究员负责数据分析，创意作家负责文章结构和表达"
          : "Researcher handles data analysis, Creative Writer handles structure and expression",
    },
    {
      name: language === "zh" ? "商业计划制定" : "Business Plan Development",
      gpts: [2, 5], // Business Analyst + Strategy Consultant
      description:
        language === "zh"
          ? "商业分析师提供市场分析，策略顾问制定发展战略"
          : "Business Analyst provides market analysis, Strategy Consultant develops growth strategy",
    },
    {
      name: language === "zh" ? "技术产品开发" : "Tech Product Development",
      gpts: [4, 6], // Tech Expert + Data Scientist
      description:
        language === "zh"
          ? "技术专家负责架构设计，数据科学家负责算法优化"
          : "Tech Expert handles architecture design, Data Scientist handles algorithm optimization",
    },
  ]

  const filteredGPTs = gptLibrary.filter((gpt) => {
    const matchesSearch =
      gpt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      gpt.specialty.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = activeCategory === "all" || gpt.category === activeCategory
    return matchesSearch && matchesCategory
  })

  const addGPT = (gpt: any) => {
    if (selectedGPTs.length < 4 && !selectedGPTs.find((selected) => selected.id === gpt.id)) {
      setSelectedGPTs([...selectedGPTs, gpt])
    }
  }

  const removeGPT = (gptId: number) => {
    setSelectedGPTs(selectedGPTs.filter((gpt) => gpt.id !== gptId))
  }

  const addCombo = (combo: any) => {
    const comboGPTs = combo.gpts.map((id) => gptLibrary.find((gpt) => gpt.id === id)).filter(Boolean)
    const newGPTs = comboGPTs.filter((gpt) => !selectedGPTs.find((selected) => selected.id === gpt.id))

    if (selectedGPTs.length + newGPTs.length <= 4) {
      setSelectedGPTs([...selectedGPTs, ...newGPTs])
    }
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {language === "zh" ? "AI助手库" : "AI Assistant Library"}
          </h2>
          <p className="text-gray-600">
            {language === "zh"
              ? "选择专业的AI助手来协作完成您的任务"
              : "Choose professional AI assistants to collaborate on your tasks"}
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder={t[language].search}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="all">{t[language].all}</TabsTrigger>
            <TabsTrigger value="providers">{language === "zh" ? "AI提供商" : "AI Providers"}</TabsTrigger>
            <TabsTrigger value="organizations">{language === "zh" ? "AI组织" : "AI Organizations"}</TabsTrigger>
            <TabsTrigger value="specialists">{language === "zh" ? "专业助手" : "Specialists"}</TabsTrigger>
            <TabsTrigger value="recommended">{t[language].recommended}</TabsTrigger>
          </TabsList>

          <TabsContent value="recommended" className="space-y-4">
            <div className="grid gap-4">
              {recommendedCombos.map((combo, index) => (
                <Card key={index} className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-2">{combo.name}</h3>
                      <p className="text-gray-600 text-sm mb-3">{combo.description}</p>
                      <div className="flex items-center space-x-2">
                        {combo.gpts.map((gptId) => {
                          const gpt = gptLibrary.find((g) => g.id === gptId)
                          return gpt ? (
                            <Badge key={gptId} variant="secondary" className="flex items-center space-x-1">
                              <div className={`w-3 h-3 rounded-full ${gpt.color}`}></div>
                              <span>{gpt.name}</span>
                            </Badge>
                          ) : null
                        })}
                      </div>
                    </div>
                    <Button onClick={() => addCombo(combo)}>
                      <Plus className="w-4 h-4 mr-2" />
                      {t[language].add}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value={activeCategory} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredGPTs.map((gpt) => {
                const isSelected = selectedGPTs.find((selected) => selected.id === gpt.id)
                const Icon = gpt.icon

                return (
                  <Card
                    key={gpt.id}
                    className={`p-6 transition-all hover:shadow-lg ${isSelected ? "ring-2 ring-blue-500" : ""}`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className={`w-12 h-12 rounded-lg ${gpt.color} flex items-center justify-center`}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">{gpt.name}</h3>
                          <p className="text-sm text-gray-600">{gpt.role}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Star className="w-4 h-4 text-yellow-400 fill-current" />
                        <span className="text-sm font-medium">{gpt.rating}</span>
                      </div>
                    </div>

                    <p className="text-gray-700 text-sm mb-4">{gpt.description}</p>

                    {gpt.type === "organization" && (
                      <div className="mb-3">
                        <div className="text-xs font-medium text-gray-500 mb-2">
                          {language === "zh" ? "团队成员" : "Team Members"}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {gpt.members?.map((member, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {member}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mb-4">
                      <div className="text-xs font-medium text-gray-500 mb-1">{t[language].specialty}</div>
                      <p className="text-sm text-gray-700">{gpt.specialty}</p>
                    </div>

                    <Button
                      className="w-full"
                      variant={isSelected ? "secondary" : "default"}
                      onClick={() => (isSelected ? removeGPT(gpt.id) : addGPT(gpt))}
                      disabled={!isSelected && selectedGPTs.length >= 4}
                    >
                      {isSelected ? (
                        <>
                          <span>{t[language].remove}</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-2" />
                          {t[language].add}
                        </>
                      )}
                    </Button>
                  </Card>
                )
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
