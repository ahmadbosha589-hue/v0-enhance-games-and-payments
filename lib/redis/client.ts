"use server"

import { Redis } from "@upstash/redis"

// Singleton Redis client
let redisClient: Redis | null = null

export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient

  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN

  if (!url || !token) {
    console.warn("[Redis] Missing KV_REST_API_URL or KV_REST_API_TOKEN")
    return null
  }

  try {
    redisClient = new Redis({ url, token })
    return redisClient
  } catch (error) {
    console.error("[Redis] Failed to create client:", error)
    return null
  }
}

// Helper to check if Redis is available
export function isRedisAvailable(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}
