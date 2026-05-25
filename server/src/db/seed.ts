import bcrypt from 'bcryptjs'
import { db } from './index.js'
import { initSchema } from './schema.js'

export function seed(): void {
  initSchema()

  const existingAdmin = db.prepare('SELECT id FROM users WHERE role = ?').get('admin')
  if (existingAdmin) {
    console.log('[DB] Admin user already exists, skipping seed')
    return
  }

  const hash = bcrypt.hashSync('admin123', 10)
  db.prepare(
    `INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, ?, ?)`
  ).run('admin', hash, 'admin', 'active')

  console.log('[DB] Seeded admin user: admin / admin123')
}
