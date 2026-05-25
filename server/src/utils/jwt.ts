import jwt from 'jsonwebtoken'
import { config } from '../config.js'

export interface JwtPayload {
  userId: number
  username: string
  role: string
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn })
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as JwtPayload
}
