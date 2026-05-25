import Database from 'better-sqlite3'
import { config } from '../config.js'

export const db = new Database(config.dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
