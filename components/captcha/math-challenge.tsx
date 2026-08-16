"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Calculator, RefreshCw, CheckCircle, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface MathChallengeProps {
  onVerify: (success: boolean) => void
  difficulty?: "easy" | "medium" | "hard"
}

type Operation = "+" | "-" | "×"

interface MathProblem {
  num1: number
  num2: number
  operation: Operation
  answer: number
}

function generateProblem(difficulty: "easy" | "medium" | "hard"): MathProblem {
  const operations: Operation[] = ["+", "-", "×"]
  const operation = operations[Math.floor(Math.random() * (difficulty === "easy" ? 2 : 3))]

  let num1: number, num2: number, answer: number

  switch (difficulty) {
    case "easy":
      num1 = Math.floor(Math.random() * 10) + 1
      num2 = Math.floor(Math.random() * 10) + 1
      break
    case "medium":
      num1 = Math.floor(Math.random() * 20) + 5
      num2 = Math.floor(Math.random() * 15) + 1
      break
    case "hard":
      num1 = Math.floor(Math.random() * 50) + 10
      num2 = Math.floor(Math.random() * 30) + 5
      break
  }

  // Ensure subtraction doesn't go negative for easier UX
  if (operation === "-" && num2 > num1) {
    ;[num1, num2] = [num2, num1]
  }

  switch (operation) {
    case "+":
      answer = num1 + num2
      break
    case "-":
      answer = num1 - num2
      break
    case "×":
      // Keep multiplication simpler
      num1 = Math.floor(Math.random() * 12) + 2
      num2 = Math.floor(Math.random() * 10) + 2
      answer = num1 * num2
      break
  }

  return { num1, num2, operation, answer }
}

export function MathChallenge({ onVerify, difficulty = "easy" }: MathChallengeProps) {
  const [problem, setProblem] = useState<MathProblem | null>(null)
  const [userAnswer, setUserAnswer] = useState("")
  const [attempts, setAttempts] = useState(0)
  const [status, setStatus] = useState<"pending" | "correct" | "incorrect">("pending")
  const [showHint, setShowHint] = useState(false)
  const maxAttempts = 3

  const generateNewProblem = useCallback(() => {
    setProblem(generateProblem(difficulty))
    setUserAnswer("")
    setStatus("pending")
    setShowHint(false)
  }, [difficulty])

  useEffect(() => {
    generateNewProblem()
  }, [generateNewProblem])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!problem || status !== "pending") return

    const parsedAnswer = Number.parseInt(userAnswer, 10)

    if (parsedAnswer === problem.answer) {
      setStatus("correct")
      setTimeout(() => onVerify(true), 1000)
    } else {
      setAttempts((prev) => prev + 1)
      setStatus("incorrect")

      if (attempts + 1 >= maxAttempts) {
        setTimeout(() => {
          onVerify(false)
        }, 1500)
      } else {
        setTimeout(() => {
          setStatus("pending")
          setUserAnswer("")
          setShowHint(true)
        }, 1500)
      }
    }
  }

  if (!problem) return null

  return (
    <Card className="w-full max-w-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          <span className="font-semibold">Math Challenge</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={generateNewProblem}
          disabled={status !== "pending"}
          className="h-8 w-8"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="text-center py-4">
        <p className="text-sm text-muted-foreground mb-2">Solve this problem:</p>
        <p className="text-3xl font-bold tracking-wider">
          {problem.num1} {problem.operation} {problem.num2} = ?
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <Input
            type="number"
            value={userAnswer}
            onChange={(e) => setUserAnswer(e.target.value)}
            placeholder="Enter your answer"
            className={cn(
              "text-center text-lg font-semibold",
              status === "correct" && "border-green-500 bg-green-500/10",
              status === "incorrect" && "border-red-500 bg-red-500/10",
            )}
            disabled={status !== "pending"}
            autoFocus
          />
          {status === "correct" && (
            <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500" />
          )}
          {status === "incorrect" && (
            <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-red-500" />
          )}
        </div>

        <Button type="submit" className="w-full" disabled={!userAnswer || status !== "pending"}>
          Submit Answer
        </Button>
      </form>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Attempts: {attempts}/{maxAttempts}
        </span>
        {showHint && <span className="text-amber-500">Try again carefully!</span>}
      </div>

      {status === "correct" && <p className="text-center text-sm text-green-600 font-medium">Correct! Proceeding...</p>}
      {status === "incorrect" && attempts >= maxAttempts && (
        <p className="text-center text-sm text-red-600 font-medium">Too many wrong attempts</p>
      )}
    </Card>
  )
}
