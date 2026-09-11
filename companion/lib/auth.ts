/*
 * Token für den Loopback-Kanal: Plugin und Companion teilen sich das Token
 * (in den Plugin-Einstellungen erzeugt, beim Companion als CLI-Argument).
 */

import { randomBytes, timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function timingSafeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return nodeTimingSafeEqual(leftBuffer, rightBuffer);
}